---
source_url: "https://developers.line.biz/ja/reference/line-mini-app/"
fetched_at: "2026-02-04"
---

# LINE Mini App API Reference

## Service Messages API

### Issue Notification Token

**Endpoint:** `POST https://api.line.me/message/v3/notifier/token`

**Headers:**
- `Content-Type: application/json`
- `Authorization: Bearer {channel access token}`

**Request Body:**
- `liffAccessToken` (string, required): LIFF access token from `liff.getAccessToken()`

**Response (200):**
- `notificationToken`: Service notification token
- `expiresIn`: Validity period in seconds (31,536,000 = 1 year)
- `remainingCount`: Maximum 5 messages per token
- `sessionId`: Session identifier

**Error Codes:**
- 400: Invalid request or rapid consecutive requests
- 401: Invalid access/channel tokens
- 403: Permission denied
- 500: Server error

### Send Service Message

**Endpoint:** `POST https://api.line.me/message/v3/notifier/send?target=service`

**Headers:**
- `Content-Type: application/json`
- `Authorization: Bearer {channel access token}`

**Request Body:**
- `templateName` (string): Template name with BCP 47 language tag (format: `{name}_{tag}`)
- `params` (object): Template variables
- `notificationToken` (string): Service notification token

**Supported Languages:** Japanese (ja), English (en), Traditional Chinese (zh-TW), Thai (th), Indonesian (id), Korean (ko)

**Response (200):**
- Updated `notificationToken`, `expiresIn`, `remainingCount`, `sessionId`

**Error Codes:** 400, 401, 403, 500

---

## Common Profile Quick Fill API

### Get Common Profile

**Method:** `liff.$commonProfile.get(scopes, options)`

**Parameters:**
- `scopes` (array): Profile fields to retrieve
- `options.formatOptions` (object): Formatting rules (excludeEmojis, excludeNonJp, digitsOnly)

**Returns:** `Promise<{data: Partial<CommonProfile>, error: Partial<CommonProfileError>}>`

### Get Dummy Data

**Method:** `liff.$commonProfile.getDummy(scopes, options, caseId)`

**Parameters:**
- `caseId` (number): 1-10 for different dummy datasets

**Returns:** Same structure as `get()`

### Auto-Fill Form

**Method:** `liff.$commonProfile.fill(profile)`

Uses `data-liff-autocomplete` HTML attributes to map profile fields to form inputs.

**Available Scopes:**
- `family-name` - Family name
- `given-name` - Given name
- `family-name-kana` - Family name (kana)
- `given-name-kana` - Given name (kana)
- `email` - Email address
- `tel` - Phone number
- `postal-code` - Postal code
- `address-level1` - Prefecture
- `address-level2` - City
- `address-level3` - Town
- `address-level4` - Additional address
- `bday-year` - Birth year
- `bday-month` - Birth month
- `bday-day` - Birth day
- `sex-enum` - Sex (male/female/other/prefer_not_to_say)

---

## HTML Attributes for Auto-Fill

Use `data-liff-autocomplete` attribute to enable auto-fill:

```html
<input type="text" data-liff-autocomplete="family-name" />
<input type="text" data-liff-autocomplete="given-name" />
<input type="email" data-liff-autocomplete="email" />
<input type="tel" data-liff-autocomplete="tel" />
```
