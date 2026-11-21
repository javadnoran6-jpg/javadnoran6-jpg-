import React, {useEffect, useState} from 'react';
import {CheckCircle2, Copy, Download, FileCode2, GitBranch, Smartphone} from 'lucide-react';
import {ExportFileEntry} from '../types/bot';

interface PythonApkExportViewProps {
  token: string;
  creatorName: string;
}

export const PythonApkExportView: React.FC<PythonApkExportViewProps> = ({token, creatorName}) => {
  const [files, setFiles] = useState<ExportFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('bot/rubika_music_bot.py');
  const [loading, setLoading] = useState(true);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/api/export/files')
      .then((res) => res.json())
      .then((data: {files?: ExportFileEntry[]}) => {
        if (!active) return;
        const list = data.files || [];
        setFiles(list);
        if (list.length > 0 && !list.some((f) => f.path === selectedPath)) {
          setSelectedPath(list[0].path);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, creatorName, selectedPath]);

  const activeFile = files.find((f) => f.path === selectedPath) || files[0];

  const handleCopy = () => {
    if (!activeFile) return;
    void navigator.clipboard.writeText(activeFile.content);
    setCopiedPath(activeFile.path);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  return (
    <div className="space-y-6">
      {/* GitHub APK Builder Banner */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
            <GitBranch className="w-4 h-4" />
            <span>ساخت خودکار فایل نصب اندروید (APK) با GitHub Actions + ربات پایتون</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">
            پکیج کامل ربات پایتون روبیکا و خروجی APK گیت‌هاب
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            تمامی کدهای پایتون ربات موزیکال (با توکن ثبت‌شده شما و نام سازنده «{creatorName}»)، اپلیکیشن اندروید Kivy، فایل <code className="font-mono text-slate-200">buildozer.spec</code> و ورک‌فلو <code className="font-mono text-slate-200">.github/workflows/build-apk.yml</code> آماده شده است. با یک کلیک فایل ZIP را دانلود کرده و در گیت‌هاب خود پوش کنید تا APK به صورت خودکار ساخته شود.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <a
            href="/api/export/full-app-zip"
            download="paria-rubika-music-app.zip"
            className="px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>دانلود مستقیم کل برنامه (.zip)</span>
          </a>
          <a
            href="/api/export/github-apk-zip"
            download="parya-rubika-music-bot-apk-github.zip"
            className="px-5 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-colors"
          >
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span>دانلود پکیج پایتون + APK گیت‌هاب</span>
          </a>
        </div>
      </section>

      {/* 4-Step GitHub Actions APK Instructions */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-mono text-emerald-400">01</p>
          <p className="text-sm font-semibold text-slate-100 mt-1">دانلود فایل ZIP</p>
          <p className="text-xs text-slate-400 mt-1">
            پکیج آماده را با دکمه بالا دانلود و از حالت فشرده خارج کنید.
          </p>
        </div>
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-mono text-emerald-400">02</p>
          <p className="text-sm font-semibold text-slate-100 mt-1">ساخت مخزن گیت‌هاب</p>
          <p className="text-xs text-slate-400 mt-1">
            فایل‌ها شامل پوشه <span className="font-mono">.github/workflows</span> را در مخزن گیت‌هاب خود آپلود کنید.
          </p>
        </div>
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-mono text-emerald-400">03</p>
          <p className="text-sm font-semibold text-slate-100 mt-1">اجرای Build APK</p>
          <p className="text-xs text-slate-400 mt-1">
            در تب Actions گیت‌هاب، ورک‌فلو ساخت اندروید به صورت خودکار فایل APK را کامپایل می‌کند.
          </p>
        </div>
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-mono text-emerald-400">04</p>
          <p className="text-sm font-semibold text-slate-100 mt-1">نصب روی اندروید</p>
          <p className="text-xs text-slate-400 mt-1">
            از بخش Artifacts یا Releases فایل <span className="font-mono">.apk</span> را دانلود و روی گوشی نصب کنید.
          </p>
        </div>
      </section>

      {/* File Browser & Source Code Inspector */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 px-2 pb-2 border-b border-slate-800">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-100">فایل‌های پروژه</h3>
          </div>

          {loading ? (
            <div className="py-6 text-center text-xs text-slate-400">در حال آماده‌سازی فایل‌ها...</div>
          ) : (
            files.map((file) => {
              const active = file.path === activeFile?.path;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  className={`w-full text-right p-3 rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-slate-100'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-mono text-emerald-400 truncate text-left" dir="ltr">
                    {file.path}
                  </p>
                  <p className="text-xs font-medium text-slate-200 mt-1">{file.title}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{file.description}</p>
                </button>
              );
            })
          )}
        </div>

        <div className="lg:col-span-8 bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileCode2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-mono text-slate-200 truncate" dir="ltr">
                {activeFile?.path || '...'}
              </span>
            </div>
            <button
              type="button"
              disabled={!activeFile}
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {copiedPath === activeFile?.path ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedPath === activeFile?.path ? 'کپی شد' : 'کپی کد'}</span>
            </button>
          </div>
          <pre
            dir="ltr"
            className="p-5 bg-[#0B0F17] text-xs font-mono text-slate-200 overflow-x-auto max-h-[560px] leading-relaxed text-left"
          >
            <code>{activeFile?.content || ''}</code>
          </pre>
        </div>
      </section>
    </div>
  );
};
