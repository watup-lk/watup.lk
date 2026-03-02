package handlers

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"regexp"
	"strings"
	"unicode"

	"github.com/watup-lk/identity-service/internal/service"
)

// emailRegex validates basic RFC 5322 email format.
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// validateEmail returns an error message if the email is invalid.
func validateEmail(email string) string {
	if email == "" {
		return "email is required"
	}
	if !emailRegex.MatchString(email) {
		return "invalid email format"
	}
	return ""
}

// validatePassword enforces a minimum password policy:
// at least 8 characters, at least one letter and one digit.
func validatePassword(password string) string {
	if len(password) < 8 {
		return "password must be at least 8 characters"
	}
	var hasLetter, hasDigit bool
	for _, c := range password {
		if unicode.IsLetter(c) {
			hasLetter = true
		}
		if unicode.IsDigit(c) {
			hasDigit = true
		}
	}
	if !hasLetter || !hasDigit {
		return "password must contain at least one letter and one digit"
	}
	return ""
}

// AuthHandler handles all authentication HTTP endpoints.
type AuthHandler struct {
	svc *service.IdentityService
}

func NewAuthHandler(svc *service.IdentityService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

// --- Request / Response types ---

type signupRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Age      *int   `json:"age,omitempty"`
}

type signupResponse struct {
	UserID string `json:"user_id"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    string `json:"expires_at"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type logoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type validateResponse struct {
	UserID string `json:"user_id"`
}

type errorResponse struct {
	Error string `json:"error"`
}

// --- Handlers ---

// Signup godoc
// POST /auth/signup
// Body: {"email": "...", "password": "..."}
func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if msg := validateEmail(req.Email); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	if msg := validatePassword(req.Password); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	if req.Age != nil && (*req.Age < 13 || *req.Age > 120) {
		writeError(w, http.StatusBadRequest, "age must be between 13 and 120")
		return
	}

	result, err := h.svc.Signup(r.Context(), req.Name, req.Email, req.Password, clientIP(r), req.Age)
	if err != nil {
		if errors.Is(err, service.ErrUserAlreadyExists) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "signup failed")
		return
	}

	writeJSON(w, http.StatusCreated, signupResponse{UserID: result.UserID})
}

// Login godoc
// POST /auth/login
// Body: {"email": "...", "password": "..."}
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	pair, err := h.svc.Login(r.Context(), req.Email, req.Password, clientIP(r))
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) || errors.Is(err, service.ErrAccountDisabled) {
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		writeError(w, http.StatusInternalServerError, "login failed")
		return
	}

	writeJSON(w, http.StatusOK, loginResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresAt:    pair.ExpiresAt.UTC().Format("2006-01-02T15:04:05Z"),
	})
}

// Refresh godoc
// POST /auth/refresh
// Body: {"refresh_token": "..."}
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RefreshToken == "" {
		writeError(w, http.StatusBadRequest, "refresh_token is required")
		return
	}

	pair, err := h.svc.Refresh(r.Context(), req.RefreshToken, clientIP(r))
	if err != nil {
		if errors.Is(err, service.ErrInvalidToken) {
			writeError(w, http.StatusUnauthorized, "invalid or expired refresh token")
			return
		}
		writeError(w, http.StatusInternalServerError, "refresh failed")
		return
	}

	writeJSON(w, http.StatusOK, loginResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresAt:    pair.ExpiresAt.UTC().Format("2006-01-02T15:04:05Z"),
	})
}

// Logout godoc
// POST /auth/logout
// Body: {"refresh_token": "..."}
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var req logoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RefreshToken == "" {
		writeError(w, http.StatusBadRequest, "refresh_token is required")
		return
	}

	if err := h.svc.Logout(r.Context(), req.RefreshToken, clientIP(r)); err != nil {
		writeError(w, http.StatusInternalServerError, "logout failed")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ValidateToken godoc
// GET /auth/validate
// Header: Authorization: Bearer <access_token>
// Returns the user_id contained in the token — called by BFF to authenticate requests.
func (h *AuthHandler) ValidateToken(w http.ResponseWriter, r *http.Request) {
	tokenString := extractBearerToken(r)
	if tokenString == "" {
		writeError(w, http.StatusUnauthorized, "missing or malformed Authorization header")
		return
	}

	userID, err := h.svc.ValidateAccessToken(r.Context(), tokenString)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid or expired token")
		return
	}

	writeJSON(w, http.StatusOK, validateResponse{UserID: userID})
}

// --- Helpers ---

// clientIP extracts the client's IP address, preferring the X-Real-IP header
// set by the NGINX Ingress controller, falling back to RemoteAddr.
func clientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		// X-Forwarded-For may contain multiple IPs; take the first (client) IP
		return strings.SplitN(ip, ",", 2)[0]
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

func extractBearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(auth, "Bearer ")
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorResponse{Error: msg})
}
