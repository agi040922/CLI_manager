import React, { useState, useEffect } from "react";
import { Check, Loader2, X, ExternalLink, Sparkles } from "lucide-react";
import logo from "../../assets/logo.png";

interface LicenseVerificationProps {
  onVerify: (key: string, isFreeMode?: boolean) => Promise<boolean>;
}

// License purchase URL
const LICENSE_PURCHASE_URL = "https://www.solhun.com/pricing";

export const LicenseVerification: React.FC<LicenseVerificationProps> = ({
  onVerify,
}) => {
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);

  // Check for existing license on mount
  useEffect(() => {
    const checkExistingLicense = async () => {
      try {
        // First check if there's a saved license
        const checkResult = await window.api.licenseCheck();

        if (checkResult.success && checkResult.data?.hasLicense) {
          // Validate the existing license
          const validateResult = await window.api.licenseValidate();

          if (validateResult.success) {
            // License is valid, auto-verify
            await onVerify("");
          }
        }
      } catch (err) {
        console.error("License check error:", err);
      } finally {
        setCheckingExisting(false);
      }
    };

    checkExistingLicense();
  }, [onVerify]);

  const handleVerify = async () => {
    if (!licenseKey.trim()) {
      setError("Please enter a license key");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Activate license with Lemon Squeezy
      const result = await window.api.licenseActivate(licenseKey.trim());

      if (result.success) {
        // License activated successfully
        await onVerify(licenseKey);
      } else {
        // Show error message from API
        setError(getErrorMessage(result.error));
      }
    } catch (err: any) {
      console.error("License verification error:", err);
      setError("Verification failed. Please check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Convert Lemon Squeezy error messages to user-friendly messages
  const getErrorMessage = (error?: string): string => {
    if (!error) return "Invalid license key";

    const errorLower = error.toLowerCase();

    if (errorLower.includes("invalid") || errorLower.includes("not found")) {
      return "Invalid license key. Please check and try again.";
    }
    if (errorLower.includes("expired")) {
      return "This license has expired. Please renew your subscription.";
    }
    if (errorLower.includes("disabled")) {
      return "This license has been disabled. Please contact support.";
    }
    if (errorLower.includes("limit") || errorLower.includes("activation")) {
      return "Activation limit reached. Please deactivate another device or upgrade your license.";
    }
    if (errorLower.includes("network") || errorLower.includes("fetch")) {
      return "Network error. Please check your internet connection.";
    }

    return error;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleVerify();
    }
  };

  const handleGetLicense = () => {
    // Open license purchase URL in external browser
    window.api.openExternal(LICENSE_PURCHASE_URL);
  };

  // Show loading while checking existing license
  if (checkingExisting) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-purple-500" />
          <span className="text-gray-400 text-sm">Checking license...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-8 text-center border-b border-white/5">
          <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <img src={logo} alt="CLI Manager Logo" className="w-full h-full object-contain drop-shadow-[0_0_30px_rgba(147,51,234,0.3)]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            License Verification
          </h1>
          <p className="text-sm text-gray-400">
            Please enter your license key to activate CLI Manager.
          </p>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 ml-1">
                License Key
              </label>
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => {
                  setLicenseKey(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                className={`w-full bg-white/5 border ${
                  error
                    ? "border-red-500/50 focus:border-red-500"
                    : "border-white/10 focus:border-purple-500"
                } rounded-xl px-4 py-3.5 text-white placeholder-gray-600 outline-none transition-all duration-200 text-sm font-mono tracking-wide`}
                autoFocus
              />
              {error && (
                <div className="mt-3 flex items-center gap-2 text-xs text-red-400 animate-in slide-in-from-top-1">
                  <X size={12} />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-white/5 border-t border-white/5">
          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full px-4 py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white text-sm rounded-xl font-medium transition-all duration-200 shadow-lg shadow-purple-900/20 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Verifying License...
              </>
            ) : (
              <>
                <Check size={18} />
                Verify License
              </>
            )}
          </button>

          {/* Continue with Free button */}
          <button
            onClick={() => onVerify("", true)}
            disabled={loading}
            className="w-full mt-3 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors"
          >
            Continue with Free Plan →
          </button>

          <p className="mt-4 text-center text-xs text-gray-500">
            Don't have a license key?{" "}
            <button
              onClick={handleGetLicense}
              className="text-purple-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1"
            >
              Get one here
              <ExternalLink size={10} />
            </button>
          </p>

          {/* Free plan features */}
          <div className="mt-3 px-2 py-1.5 bg-white/5 rounded border border-white/5">
            <p className="text-[10px] text-gray-500">
              Free: 2 workspaces, 5 sessions, 3 templates, GitHub, Port monitoring
            </p>
          </div>

          <p className="mt-4 text-center text-xs text-gray-600">
            Having trouble? Contact <span className="text-gray-500">solhun.jeong@gmail.com</span>
          </p>
        </div>
      </div>
    </div>
  );
};
