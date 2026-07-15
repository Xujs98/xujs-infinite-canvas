package service

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"html"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const (
	registrationCodeTTL      = 10 * time.Minute
	registrationCodeCooldown = time.Minute
	registrationCodeAttempts = 5
)

type registrationCodeEntry struct {
	hash       string
	expiresAt  time.Time
	lastSentAt time.Time
	attempts   int
}

type registrationIPWindow struct {
	startedAt time.Time
	count     int
}

type emailCodeStore struct {
	sync.Mutex
	items map[string]registrationCodeEntry
	ips   map[string]registrationIPWindow
}

func newEmailCodeStore() emailCodeStore {
	return emailCodeStore{items: make(map[string]registrationCodeEntry), ips: make(map[string]registrationIPWindow)}
}

var registrationCodes = newEmailCodeStore()
var passwordChangeCodes = newEmailCodeStore()
var loginEmailCodes = newEmailCodeStore()

func SendRegistrationEmailCode(rawEmail string, remoteAddr string) error {
	settings, err := GetSystemSettings()
	if err != nil {
		return err
	}
	if !settings.EmailEnabled {
		return safeMessageError{message: "邮件验证未启用"}
	}
	if !settings.AllowRegister {
		return safeMessageError{message: "当前未开放注册"}
	}
	emailAddress := normalizeEmail(rawEmail)
	if err := validateEmailAddress(emailAddress); err != nil {
		return err
	}
	if _, exists, err := repository.GetUserByEmail(emailAddress); err != nil {
		return err
	} else if exists {
		return safeMessageError{message: "该邮箱已注册"}
	}

	return sendManagedEmailCode(&registrationCodes, emailAddress, remoteAddr, settings, "注册")
}

func SendPasswordChangeEmailCode(userID string, remoteAddr string) error {
	settings, err := GetSystemSettings()
	if err != nil {
		return err
	}
	if !settings.EmailEnabled {
		return safeMessageError{message: "邮件验证未启用"}
	}
	user, ok, err := repository.GetUserByID(userID)
	if err != nil {
		return err
	}
	if !ok {
		return safeMessageError{message: "用户不存在"}
	}
	emailAddress := normalizeEmail(user.Email)
	if emailAddress == "" {
		return safeMessageError{message: "账号未绑定邮箱，请联系管理员"}
	}
	if err := validateEmailAddress(emailAddress); err != nil {
		return safeMessageError{message: "账号绑定邮箱无效，请联系管理员"}
	}
	return sendManagedEmailCode(&passwordChangeCodes, emailAddress, remoteAddr, settings, "修改密码")
}

func SendLoginEmailCode(rawEmail string, remoteAddr string) error {
	settings, err := GetSystemSettings()
	if err != nil {
		return err
	}
	if !settings.EmailEnabled {
		return safeMessageError{message: "邮件验证未启用"}
	}
	emailAddress := normalizeEmail(rawEmail)
	if err := validateEmailAddress(emailAddress); err != nil {
		return err
	}
	user, ok, err := repository.GetUserByEmail(emailAddress)
	if err != nil {
		return err
	}
	if !ok {
		return safeMessageError{message: "该邮箱未注册"}
	}
	if user.Status == model.UserStatusBan {
		return safeMessageError{message: "账号已被禁用"}
	}
	return sendManagedEmailCode(&loginEmailCodes, emailAddress, remoteAddr, settings, "登录")
}

func sendManagedEmailCode(store *emailCodeStore, emailAddress string, remoteAddr string, settings model.SystemSettings, purpose string) error {
	now := time.Now()
	clientIP := remoteAddr
	if host, _, splitErr := net.SplitHostPort(remoteAddr); splitErr == nil {
		clientIP = host
	}
	store.Lock()
	entry, exists := store.items[emailAddress]
	if exists && now.Sub(entry.lastSentAt) < registrationCodeCooldown {
		remaining := int(registrationCodeCooldown.Seconds() - now.Sub(entry.lastSentAt).Seconds())
		store.Unlock()
		return safeMessageError{message: fmt.Sprintf("请 %d 秒后再发送", remaining)}
	}
	ipWindow := store.ips[clientIP]
	if now.Sub(ipWindow.startedAt) >= 10*time.Minute {
		ipWindow = registrationIPWindow{startedAt: now}
	}
	if ipWindow.count >= 20 {
		store.Unlock()
		return safeMessageError{message: "验证码发送过于频繁，请稍后再试"}
	}
	ipWindow.count++
	store.ips[clientIP] = ipWindow
	store.Unlock()

	code, err := newRegistrationCode()
	if err != nil {
		return err
	}
	subject := fmt.Sprintf("%s %s验证码", settings.SiteName, purpose)
	body := fmt.Sprintf("<div style=\"font-family:Arial,sans-serif;color:#18202b\"><h2>%s</h2><p>你的%s验证码是：</p><p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">%s</p><p>验证码 10 分钟内有效，请勿转发给他人。</p></div>", html.EscapeString(settings.SiteName), html.EscapeString(purpose), code)
	if err := sendSMTPMail(settings.SMTPHost, settings.SMTPPort, settings.SMTPUsername, settings.SMTPPassword, settings.SMTPFrom, settings.SMTPTLS, emailAddress, subject, body); err != nil {
		return safeMessageError{message: "验证码发送失败，请检查邮件服务配置"}
	}

	store.Lock()
	store.items[emailAddress] = registrationCodeEntry{hash: hashRegistrationCode(emailAddress, code), expiresAt: now.Add(registrationCodeTTL), lastSentAt: now}
	store.Unlock()
	return nil
}

func validateRegistrationEmailCode(rawEmail string, rawCode string) error {
	emailAddress := normalizeEmail(rawEmail)
	if err := validateEmailAddress(emailAddress); err != nil {
		return err
	}
	code := strings.TrimSpace(rawCode)
	if code == "" {
		return safeMessageError{message: "请输入邮箱验证码"}
	}
	registrationCodes.Lock()
	defer registrationCodes.Unlock()
	return validateEmailCodeLocked(&registrationCodes, emailAddress, code, false)
}

func verifyAndConsumeRegistrationEmailCode(rawEmail string, rawCode string) error {
	emailAddress := normalizeEmail(rawEmail)
	if err := validateEmailAddress(emailAddress); err != nil {
		return err
	}
	code := strings.TrimSpace(rawCode)
	if code == "" {
		return safeMessageError{message: "请输入邮箱验证码"}
	}
	registrationCodes.Lock()
	defer registrationCodes.Unlock()
	return validateEmailCodeLocked(&registrationCodes, emailAddress, code, true)
}

func verifyAndConsumePasswordChangeEmailCode(rawEmail string, rawCode string) error {
	emailAddress := normalizeEmail(rawEmail)
	code := strings.TrimSpace(rawCode)
	if code == "" {
		return safeMessageError{message: "请输入邮箱验证码"}
	}
	passwordChangeCodes.Lock()
	defer passwordChangeCodes.Unlock()
	return validateEmailCodeLocked(&passwordChangeCodes, emailAddress, code, true)
}

func verifyAndConsumeLoginEmailCode(rawEmail string, rawCode string) error {
	emailAddress := normalizeEmail(rawEmail)
	if err := validateEmailAddress(emailAddress); err != nil {
		return err
	}
	code := strings.TrimSpace(rawCode)
	if code == "" {
		return safeMessageError{message: "请输入邮箱验证码"}
	}
	loginEmailCodes.Lock()
	defer loginEmailCodes.Unlock()
	return validateEmailCodeLocked(&loginEmailCodes, emailAddress, code, true)
}

func validateEmailCodeLocked(store *emailCodeStore, emailAddress string, code string, consume bool) error {
	entry, exists := store.items[emailAddress]
	if !exists || time.Now().After(entry.expiresAt) {
		delete(store.items, emailAddress)
		return safeMessageError{message: "邮箱验证码已过期，请重新发送"}
	}
	if entry.attempts >= registrationCodeAttempts {
		delete(store.items, emailAddress)
		return safeMessageError{message: "验证码错误次数过多，请重新发送"}
	}
	if entry.hash != hashRegistrationCode(emailAddress, code) {
		entry.attempts++
		store.items[emailAddress] = entry
		return safeMessageError{message: "邮箱验证码错误"}
	}
	if consume {
		delete(store.items, emailAddress)
	}
	return nil
}

func normalizeEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validateEmailAddress(value string) error {
	address, err := mail.ParseAddress(value)
	if err != nil || normalizeEmail(address.Address) != value {
		return safeMessageError{message: "请输入有效的邮箱地址"}
	}
	return nil
}

func newRegistrationCode() (string, error) {
	var value [4]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	n := uint32(value[0])<<24 | uint32(value[1])<<16 | uint32(value[2])<<8 | uint32(value[3])
	return fmt.Sprintf("%06d", n%1000000), nil
}

func hashRegistrationCode(emailAddress string, code string) string {
	sum := sha256.Sum256([]byte(emailAddress + "\x00" + code))
	return hex.EncodeToString(sum[:])
}

func sendSMTPMail(host string, port int, username string, password string, from string, useTLS bool, to string, subject string, htmlBody string) error {
	host = strings.TrimSpace(host)
	fromAddress, err := mail.ParseAddress(strings.TrimSpace(from))
	if err != nil || host == "" || port <= 0 {
		return fmt.Errorf("SMTP 配置不完整")
	}
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	tlsConfig := &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}
	var client *smtp.Client
	if useTLS && port == 465 {
		connection, dialErr := tls.Dial("tcp", addr, tlsConfig)
		if dialErr != nil {
			return dialErr
		}
		client, err = smtp.NewClient(connection, host)
	} else {
		client, err = smtp.Dial(addr)
	}
	if err != nil {
		return err
	}
	defer client.Close()
	if useTLS && port != 465 {
		if err := client.StartTLS(tlsConfig); err != nil {
			return err
		}
	}
	if strings.TrimSpace(username) != "" {
		if err := client.Auth(smtp.PlainAuth("", strings.TrimSpace(username), password, host)); err != nil {
			return err
		}
	}
	if err := client.Mail(fromAddress.Address); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	message := "From: " + fromAddress.String() + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + mime.QEncoding.Encode("UTF-8", subject) + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/html; charset=UTF-8\r\n\r\n" + htmlBody
	if _, err := writer.Write([]byte(message)); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}
