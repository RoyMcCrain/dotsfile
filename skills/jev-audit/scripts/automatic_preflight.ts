const credentialPatterns = [
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bASIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\bxox(?:b|p|a|r|s)-[A-Za-z0-9-]{10,}\b/g,
  /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s/@:]+:[^\s/@]+@/gi,
  /\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@/gi,
  /\b(?:account[_ -]?key|storage[_ -]?key)\s*[:=]\s*["']?[A-Za-z0-9/+_=-]{20,}/gi,
  /\bAccountKey\s*=\s*[A-Za-z0-9/+_=-]{20,}/gi,
  /\bBearer\s+[A-Za-z0-9._~+/-]{24,}={0,2}\b/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g,
];
const dummyEmails = /@(example\.(?:com|net|org)|[^@]+\.(?:test|invalid))$/i;
const testValue = /^(?:test|mock|dummy|placeholder|changeme|xxx|0+)$/i;
const emails = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const sensitiveFields =
  /^(?:api[_-]?key|client[_-]?secret|secret|password|passwd|(?:access|auth|refresh)[_-]?token|token|(?:access|account|storage)[_-]?key)$/i;
const personalFields =
  /^(?:phone|mobile|telephone|address|address[_-]?line|postal[_-]?code|zip(?:code)?|first[_-]?name|last[_-]?name|customer[_-]?(?:name|address|phone|email|contact)|email|contact[_-]?(?:name|email|phone|address))$/i;
const literalField = /(["']?)([A-Za-z_$][\w$-]*)\1\s*[:=]\s*(["'])(.*?)\3/g;
const credentialFieldName =
  /^(?:api[_-]?key|client[_-]?secret|secret|password|passwd|token|access[_-]?token|auth[_-]?token|refresh[_-]?token|access[_-]?key|account[_-]?key|storage[_-]?key)$/i;
const phoneLike =
  /(?:\+\d{1,3}[\s().-]*\d{2,4}(?:[\s().-]+\d{2,4}){1,3}|\b0\d{1,4}[-. ]\d{2,4}[-. ]\d{3,4}\b|\b\d{3}[-. ]\d{3}[-. ]\d{4}\b)/;
const address =
  /\b\d{1,6}\s+[\w.'-]+\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr)\b/i;

const isTestValue = (value: string): boolean => testValue.test(value.trim());

const checkContacts = (text: string): void => {
  for (const email of text.matchAll(emails)) {
    if (!dummyEmails.test(email[0])) {
      throw new Error("automatic_preflight_contact_suspected");
    }
  }
};

const checkCredentialTokens = (text: string): void => {
  for (const pattern of credentialPatterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[0] !== "AKIAIOSFODNN7EXAMPLE" && !isTestValue(match[0])) {
        throw new Error("automatic_preflight_credential_suspected");
      }
    }
  }
};

const checkCredentialFields = (text: string): void => {
  for (const match of text.matchAll(literalField)) {
    if (
      sensitiveFields.test(match[2]) && match[4] !== "" &&
      !isTestValue(match[4])
    ) {
      throw new Error("automatic_preflight_credential_suspected");
    }
  }
  for (const match of text.matchAll(credentialAssignment)) {
    if (credentialFieldName.test(match[1]) && !isTestValue(match[2])) {
      throw new Error("automatic_preflight_credential_suspected");
    }
  }
};

const credentialAssignment =
  /\b(?:(?:const|let|var)\s+)?["']?([A-Za-z_$][\w$-]*)["']?\s*[:=]\s*["']([^"']{8,})["']/g;

const checkPersonal = (text: string): void => {
  for (const match of text.matchAll(literalField)) {
    const field = match[2];
    const value = match[4];
    if (personalFields.test(field) && !isTestValue(value) && value !== "") {
      throw new Error("automatic_preflight_personal_data_suspected");
    }
  }
  if (phoneLike.test(text) || address.test(text)) {
    throw new Error("automatic_preflight_personal_data_suspected");
  }
};

export const automaticPreflight = (content: Uint8Array): void => {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
    checkContacts(text);
    checkCredentialTokens(text);
    checkCredentialFields(text);
    checkPersonal(text);
  } catch (error) {
    if (
      error instanceof Error && error.message.startsWith("automatic_preflight_")
    ) {
      throw error;
    }
    throw new Error("automatic_preflight_scan_failed");
  }
};
