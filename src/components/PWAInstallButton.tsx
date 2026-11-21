import React, {useState} from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileCode2,
  Smartphone,
  X,
} from 'lucide-react';
import {useOnlineStatus} from '../hooks/useOnlineStatus';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  className = '',
}) => {
  const {isInstallable, isInstalled, isIOS, isEmbeddedFrame, install} = usePWAInstall();
  const [modalOpen, setModalOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const directAppUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/` : '/';

  const handlePrimaryClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) return;
    }
    setModalOpen(true);
  };

  const handleCopyUrl = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(directAppUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1800);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handlePrimaryClick()}
        className={`flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer ${
          compact
            ? 'px-3 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
            : 'w-full py-2.5 px-3 text-xs bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/35'
        } ${className}`}
        title="دانلود و نصب مستقیم برنامه"
      >
        <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>
          {isInstallable
            ? 'نصب مستقیم برنامه'
            : isInstalled
              ? 'دانلود مستقیم فایل برنامه'
              : 'دانلود و نصب مستقیم'}
        </span>
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[#111827] border border-slate-700 p-6 shadow-2xl space-y-5 text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                  <Smartphone className="w-4 h-4" />
                  <span>نصب اپلیکیشن و دانلود مستقیم</span>
                </div>
                <h3 className="text-lg font-bold text-slate-100">
                  دریافت مستقیم ربات موزیکال روبیکا
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                aria-label="بستن"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Option 1: Direct Install as App (PWA) */}
            {!isInstalled && (
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">
                    ۱. نصب مستقیم روی گوشی یا ویندوز (اپلیکیشن PWA)
                  </p>
                  {isInstallable && (
                    <button
                      type="button"
                      onClick={() => void install()}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      نصب فوری
                    </button>
                  )}
                </div>

                {isIOS ? (
                  <p className="text-xs text-slate-300 leading-relaxed">
                    در آیفون و آیپد (مرورگر Safari): دکمه <strong className="text-white">Share</strong> پایین صفحه را بزنید و گزینه{' '}
                    <strong className="text-emerald-400">Add to Home Screen</strong> را انتخاب کنید.
                  </p>
                ) : isInstallable ? (
                  <p className="text-xs text-slate-300 leading-relaxed">
                    مرورگر آماده نصب مستقیم برنامه است. روی دکمه «نصب فوری» بزنید تا آیکون برنامه روی گوشی یا دسکتاپ اضافه شود.
                  </p>
                ) : (
                  <div className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
                    <p>
                      {isEmbeddedFrame
                        ? 'برای نمایش پنجره نصب خودکار اندروید و دسکتاپ، برنامه را در تب مستقیم مرورگر باز کنید و سپس از منوی سه نقطه گزینه «نصب برنامه / Install App» را بزنید:'
                        : 'از منوی مرورگر Chrome یا Edge گزینه «نصب برنامه (Install App)» یا «افزودن به صفحه اصلی» را انتخاب کنید:'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={directAppUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>باز کردن لینک مستقیم نصب</span>
                      </a>
                      <button
                        type="button"
                        onClick={handleCopyUrl}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedUrl ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedUrl ? 'لینک کپی شد' : 'کپی لینک برنامه'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Option 2: Direct ZIP Downloads */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-300">
                ۲. دانلود مستقیم فایل‌های برنامه (مستقیم بدون واسطه)
              </p>

              <a
                href="/api/export/full-app-zip"
                download="paria-rubika-music-app.zip"
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileArchive className="w-5 h-5 shrink-0" />
                  <div className="text-right min-w-0">
                    <p className="text-sm font-bold">دانلود مستقیم کل برنامه (.zip)</p>
                    <p className="text-[11px] text-emerald-100 truncate">
                      سورس کامل پنل وب، سرور ویسکال، موتور ربات و راهنمای اجرا
                    </p>
                  </div>
                </div>
                <Download className="w-4 h-4 shrink-0" />
              </a>

              <a
                href="/api/export/github-apk-zip"
                download="parya-rubika-music-bot-apk-github.zip"
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#0B0F17] hover:bg-slate-800/80 border border-slate-700 text-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Smartphone className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="text-right min-w-0">
                    <p className="text-sm font-semibold">دانلود پکیج ربات پایتون + پروژه APK (.zip)</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      شامل سورس اندروید Kivy، Buildozer و ورک‌فلو ساخت APK گیت‌هاب
                    </p>
                  </div>
                </div>
                <Download className="w-4 h-4 text-emerald-400 shrink-0" />
              </a>

              <a
                href="/api/export/userbot-vc.py"
                download="rubika_userbot_vc.py"
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#0B0F17] hover:bg-slate-800/80 border border-slate-800 text-slate-200 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileCode2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="text-right min-w-0">
                    <p className="text-xs font-semibold">دانلود مستقیم اسکریپت یوزربات ویسکال (.py)</p>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-400 shrink-0" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-lg">
      <span className="h-2 w-2 rounded-full bg-slate-950 animate-pulse" />
      <span>حالت آفلاین — نمایش اطلاعات ذخیره‌شده</span>
    </div>
  );
};
