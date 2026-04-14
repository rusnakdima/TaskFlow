export interface PasskeyCredential {
  credentialId: string;
  rawId: ArrayBuffer;
  response: {
    attestationObject: ArrayBuffer;
    clientDataJSON: ArrayBuffer;
    signature?: ArrayBuffer;
    authenticatorData?: ArrayBuffer;
  };
  type: string;
}

export interface WebAuthnRegistrationOptions {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{ type: string; alg: number }>;
  timeout: number;
  attestation: string;
  authenticatorSelection: {
    authenticatorAttachment?: string;
    requireResidentKey: boolean;
    userVerification: string;
  };
}

export interface WebAuthnAuthOptions {
  challenge: string;
  timeout: number;
  rpId: string;
  allowCredentials: Array<{
    type: string;
    id: string;
    transports?: string[];
  }>;
  userVerification: string;
}

export interface PasskeyResult {
  success: boolean;
  token?: string;
  error?: string;
}
