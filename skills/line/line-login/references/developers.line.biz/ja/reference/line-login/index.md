---
source_url: "https://developers.line.biz/ja/reference/line-login/"
fetched_at: "2026-02-03"
---

# LINE Login v2.1 API Reference

## Overview

LINE Login v2.1 provides OAuth-based authentication endpoints for user identification and profile management.

## Rate Limiting & Status Codes

**Rate Limits:** Thresholds are undisclosed. Bulk requests are prohibited regardless of purpose.

**Key Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Invalid parameters
- `401 Unauthorized` - Missing/invalid authorization
- `403 Forbidden` - Insufficient permissions
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

**Response Headers:** All responses include `x-line-request-id` (unique request identifier)

## OAuth Endpoints

### 1. Issue Access Token

**Endpoint:** `POST https://api.line.me/oauth2/v2.1/token`

**Request Body Parameters:**
- `grant_type` (required): "authorization_code"
- `code` (required): Authorization code from LINE platform
- `redirect_uri` (required): Must match authorization request URI
- `client_id` (required): Channel ID
- `client_secret` (required): Channel secret
- `code_verifier` (optional): PKCE string (43-128 characters)

**Response:** Access token valid 30 days, refresh token valid 90 days, ID token (if openid scope), scope details

### 2. Verify Access Token

**Endpoint:** `GET https://api.line.me/oauth2/v2.1/verify?access_token={token}`

**Response:** Scope, client_id, expires_in (seconds remaining)

**Error:** Returns `400 Bad Request` if token expired

### 3. Refresh Access Token

**Endpoint:** `POST https://api.line.me/oauth2/v2.1/token`

**Request Body:**
- `grant_type`: "refresh_token"
- `refresh_token` (required): Valid up to 90 days
- `client_id` (required): Channel ID
- `client_secret` (conditional): Required for web apps only

**Response:** New access token, token_type (Bearer), expires_in, refresh_token

### 4. Revoke Access Token

**Endpoint:** `POST https://api.line.me/oauth2/v2.1/revoke`

**Request Body:**
- `access_token` (required)
- `client_id` (required)
- `client_secret` (conditional)

**Response:** `200` with empty body

### 5. Deauthorize App

**Endpoint:** `POST https://api.line.me/user/v1/deauthorize`

**Headers:** Bearer channel access token (v2.1 or stateless type)

**Request Body:** `userAccessToken` (target user's access token)

**Response:** `204` No Content

**Error:** `400` if token invalid/already revoked

### 6. Verify ID Token

**Endpoint:** `POST https://api.line.me/oauth2/v2.1/verify`

**Request Body:**
- `id_token` (required): JWT to verify
- `client_id` (required): Expected channel ID
- `nonce` (optional): Expected nonce value
- `user_id` (optional): Expected user ID

**Response Payload:** iss, sub (user ID), aud, exp, iat, auth_time, nonce, amr (auth methods), name, picture, email

**Errors:** Invalid format, issuer, expiration, audience, nonce, or subject mismatch

### 7. Get User Info (openid scope)

**Endpoints:** `GET/POST https://api.line.me/oauth2/v2.1/userinfo`

**Headers:** Bearer access token

**Response:** sub (user ID), name, picture (requires profile scope)

## Profile Endpoints

### 8. Get User Profile

**Endpoint:** `GET https://api.line.me/v2/profile`

**Headers:** Bearer access token (requires profile scope)

**Response:** userId, displayName, pictureUrl (HTTPS), statusMessage

**Thumbnail Suffixes:** `/large` (200x200), `/small` (51x51)

## Friends Endpoints

### 9. Get Friend Status with Official Account

**Endpoint:** `GET https://api.line.me/friendship/v1/status`

**Headers:** Bearer access token (requires profile scope)

**Response:** `friendFlag` (boolean - true if user added account and didn't block)

---

**All endpoints require `Content-Type: application/x-www-form-urlencoded` for POST requests with form data.**
