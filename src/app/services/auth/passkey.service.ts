import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { EncodingHelper } from "@helpers/encoding.helper";
import { REQUEST_SERVICE } from "@services/api.service";
import { PasskeyRegistrationOptions, PasskeyAuthOptions } from "@models/security.model";

@Injectable({
  providedIn: "root",
})
export class PasskeyService {
  private requestService = inject(REQUEST_SERVICE);
  private jwtTokenService = inject(JwtTokenService);

  isPasskeyEnabledForCurrentUser(): boolean {
    const token = this.jwtTokenService.getToken();
    if (!token) return false;
    return this.jwtTokenService.getValueByKey(token, "passkeyEnabled") === "true";
  }

  isBiometricEnabledForCurrentUser(): boolean {
    const token = this.jwtTokenService.getToken();
    if (!token) return false;
    return this.jwtTokenService.getValueByKey(token, "biometricEnabled") === "true";
  }

  initPasskeyRegistration(): Observable<PasskeyRegistrationOptions> {
    return this.requestService.invokeCommand<PasskeyRegistrationOptions>(
      "initPasskeyRegistration",
      { username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "" }
    );
  }

  completePasskeyRegistration(
    credentialId: string,
    attestationObject: string,
    device: string
  ): Observable<string> {
    return this.requestService.invokeCommand<string>("completePasskeyRegistration", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      credentialId,
      attestationObject,
      device,
    });
  }

  initPasskeyAuthentication(username?: string): Observable<PasskeyAuthOptions> {
    return this.requestService.invokeCommand<PasskeyAuthOptions>("initPasskeyAuthentication", {
      username: username || null,
    });
  }

  completePasskeyAuthentication(
    signature: string,
    authenticatorData: string,
    clientData: string,
    username?: string
  ): Observable<{ verified: boolean; username: string; method: string }> {
    return this.requestService.invokeCommand<{
      verified: boolean;
      username: string;
      method: string;
    }>("completePasskeyAuthentication", {
      username: username || null,
      signature,
      authenticatorData,
      clientData,
    });
  }

  disablePasskey(): Observable<string> {
    return this.requestService.invokeCommand<string>("disablePasskey", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
    });
  }

  enableBiometric(credentialId: string, publicKey: string): Observable<string> {
    return this.requestService.invokeCommand<string>("enableBiometric", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      credentialId,
      publicKey,
    });
  }

  initBiometricAuth(
    username?: string
  ): Observable<{ options: any; challenge: string; platform: string }> {
    return this.requestService.invokeCommand<any>("initBiometricAuth", {
      username: username || null,
    });
  }

  completeBiometricAuth(signature: string, username?: string): Observable<string> {
    return this.requestService.invokeCommand<string>("completeBiometricAuth", {
      username: username || this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      signature,
    });
  }

  disableBiometric(): Observable<string> {
    return this.requestService.invokeCommand<string>("disableBiometric", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
    });
  }

  async authenticateWithPasskey(): Promise<{
    success: boolean;
    username?: string;
    requiresTotp?: boolean;
    error?: string;
  }> {
    try {
      const result = await new Promise<PasskeyAuthOptions>((resolve, reject) => {
        this.initPasskeyAuthentication().subscribe({
          next: resolve,
          error: reject,
        });
      });

      const publicKeyCredential = await this.getPasskeyAssertion(result.options);

      if (!publicKeyCredential) {
        return { success: false, error: "Failed to authenticate with passkey" };
      }

      const pkCredential = publicKeyCredential as any;
      const signature = EncodingHelper.arrayBufferToBase64(pkCredential.response.signature);
      const authenticatorData = EncodingHelper.arrayBufferToBase64(
        pkCredential.response.authenticatorData
      );
      const clientData = EncodingHelper.arrayBufferToBase64(pkCredential.response.clientJSON);

      return new Promise((resolve, reject) => {
        this.completePasskeyAuthentication(
          signature,
          authenticatorData,
          clientData,
          result.username
        ).subscribe({
          next: (authResult) => {
            resolve({
              success: true,
              username: authResult.username,
              requiresTotp: false,
            });
          },
          error: (err) => reject(err),
        });
      });
    } catch (error: any) {
      return { success: false, error: error.message || "Passkey authentication failed" };
    }
  }

  private async getPasskeyAssertion(options: any): Promise<any> {
    try {
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: EncodingHelper.base64ToArrayBuffer(options.challenge),
          timeout: options.timeout,
          rpId: options.rpId,
          allowCredentials: options.allowCredentials.map((cred: any) => ({
            type: cred.type,
            id: EncodingHelper.base64ToArrayBuffer(cred.id),
            transports: cred.transports,
          })),
          userVerification: options.userVerification,
        },
      });
      return credential;
    } catch {
      return null;
    }
  }

  async authenticateWithBiometric(): Promise<{
    success: boolean;
    username?: string;
    requiresTotp?: boolean;
    error?: string;
  }> {
    try {
      const result = await new Promise<{ options: any; challenge: string; platform: string }>(
        (resolve, reject) => {
          this.initBiometricAuth().subscribe({
            next: resolve,
            error: reject,
          });
        }
      );

      const publicKeyCredential = await navigator.credentials.get({
        publicKey: {
          challenge: EncodingHelper.base64ToArrayBuffer(result.options.challenge),
          timeout: result.options.timeout,
          rpId: result.options.rpId,
          allowCredentials: result.options.allowCredentials.map((cred: any) => ({
            type: cred.type,
            id: EncodingHelper.base64ToArrayBuffer(cred.id),
            transports: cred.transports,
          })),
          userVerification: result.options.userVerification,
        },
      });

      if (!publicKeyCredential) {
        return { success: false, error: "Biometric authentication failed" };
      }

      const pkCredential = publicKeyCredential as any;
      const signature = EncodingHelper.arrayBufferToBase64(pkCredential.response.signature);

      return new Promise((resolve, reject) => {
        this.completeBiometricAuth(signature).subscribe({
          next: () => resolve({ success: true, requiresTotp: false }),
          error: (err) => reject(err),
        });
      });
    } catch (error: any) {
      return { success: false, error: error.message || "Biometric authentication failed" };
    }
  }

  async registerBiometric(): Promise<{ success: boolean; error?: string }> {
    return this.initPasskeyRegistration()
      .toPromise()
      .then(() => ({ success: true, requiresTotp: false }))
      .catch((err) => ({ success: false, error: err.message || "Biometric registration failed" }));
  }
}
