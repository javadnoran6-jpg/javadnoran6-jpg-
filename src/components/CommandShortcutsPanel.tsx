import React, {useState} from 'react';
import {Plus, Send, Trash2, Zap} from 'lucide-react';
import {QuickCommandShortcut} from '../types/bot';

interface CommandShortcutsPanelProps {
  shortcuts: QuickCommandShortcut[];
  isBusy: boolean;
  onRunShortcut: (shortcut: QuickCommandShortcut) => Promise<void>;
  onAddShortcut: (payload: {
    label?: string;
    commandText: string;
    accent: QuickCommandShortcut['accent'];
    sendToRubika: boolean;
  }) => Promise<void>;
  onDeleteShortcut: (shortcutId: string) => Promise<void>;
}

const ACCENT_STYLES: Record<
  QuickCommandShortcut['accent'],
  {button: string; dot: string; label: string}
> = {
  emerald: {
    button: 'bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/35 text-emerald-200',
    dot: 'bg-emerald-400',
    label: 'سبز',
  },
  amber: {
    button: 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/35 text-amber-200',
    dot: 'bg-amber-400',
    label: 'کهربایی',
  },
  slate: {
    button: 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-200',
    dot: 'bg-slate-400',
    label: 'خنثی',
  },
  rose: {
    button: 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/35 text-rose-200',
    dot: 'bg-rose-400',
    label: 'قرمز',
  },
};

const EXAMPLE_COMMANDS = [
  'موزیک ملایم',
  'استراحت',
  'آهنگ لری',
  'پخش رندوم غمگین',
  'تنظیم صدا 50',
  'ادامه آهنگ',
];

export const CommandShortcutsPanel: React.FC<CommandShortcutsPanelProps> = ({
  shortcuts,
  isBusy,
  onRunShortcut,
  onAddShortcut,
  onDeleteShortcut,
}) => {
  const [commandText, setCommandText] = useState('');
  const [label, setLabel] = useState('');
  const [accent, setAccent] = useState<QuickCommandShortcut['accent']>('emerald');
  const [sendToRubika, setSendToRubika] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = commandText.trim();
    if (!cleaned) return;
    await onAddShortcut({
      label: label.trim() || undefined,
      commandText: cleaned,
      accent,
      sendToRubika,
    });
    setCommandText('');
    setLabel('');
  };

  return (
    <section className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-base font-semibold text-slate-100">
              دکمه‌های میانبر دستورات ویس‌چت
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              ({shortcuts.length})
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            هر دستور متنی (مانند «موزیک ملایم»، «استراحت» یا هر پیام دلخواه) را به دکمه تبدیل کنید و با یک کلیک در ویس‌چت اجرا و ارسال نمایید.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {EXAMPLE_COMMANDS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setCommandText(example);
                if (!label.trim()) setLabel(example);
              }}
              className="px-2.5 py-1 rounded bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 whitespace-nowrap cursor-pointer"
            >
              + {example}
            </button>
          ))}
        </div>
      </div>

      {/* Saved 1-Click Shortcut Buttons */}
      {shortcuts.length === 0 ? (
        <div className="py-6 text-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-400">
          هنوز میانبری ساخته نشده است. از فرم زیر دستور مورد نظر را اضافه کنید.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {shortcuts.map((sc) => {
            const theme = ACCENT_STYLES[sc.accent] || ACCENT_STYLES.emerald;
            return (
              <div
                key={sc.id}
                className={`group rounded-lg border flex items-stretch overflow-hidden transition-colors ${theme.button}`}
              >
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onRunShortcut(sc)}
                  className="flex-1 px-3.5 py-2.5 text-right flex items-center gap-2.5 min-w-0 cursor-pointer disabled:opacity-50"
                  title={`اجرای دستور: ${sc.commandText}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${theme.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold truncate">{sc.label}</span>
                      {sc.sendToRubika && (
                        <Send className="w-3 h-3 opacity-65 shrink-0" aria-label="ارسال به روبیکا" />
                      )}
                    </div>
                    {sc.label !== sc.commandText && (
                      <p className="text-[11px] opacity-75 truncate mt-0.5">{sc.commandText}</p>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onDeleteShortcut(sc.id)}
                  aria-label={`حذف میانبر ${sc.label}`}
                  title="حذف میانبر"
                  className="px-2.5 border-r border-white/10 text-slate-400 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Custom Shortcut Form */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="pt-4 border-t border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-3 items-end"
      >
        <div className="lg:col-span-4">
          <label className="block text-xs text-slate-300 mb-1.5">متن دستور یا پیام ویس‌چت</label>
          <input
            type="text"
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            placeholder="مثال: موزیک ملایم یا استراحت"
            className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
          />
        </div>

        <div className="lg:col-span-3">
          <label className="block text-xs text-slate-300 mb-1.5">عنوان روی دکمه (اختیاری)</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="پیش‌فرض: همان متن دستور"
            className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
          />
        </div>

        <div className="lg:col-span-2">
          <label className="block text-xs text-slate-300 mb-1.5">رنگ دکمه</label>
          <select
            value={accent}
            onChange={(e) => setAccent(e.target.value as QuickCommandShortcut['accent'])}
            className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none"
          >
            <option value="emerald">سبز زمردی</option>
            <option value="amber">کهربایی</option>
            <option value="slate">خنثی</option>
            <option value="rose">قرمز</option>
          </select>
        </div>

        <div className="lg:col-span-3 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none py-2">
            <input
              type="checkbox"
              checked={sendToRubika}
              onChange={(e) => setSendToRubika(e.target.checked)}
              className="accent-emerald-500 rounded cursor-pointer"
            />
            <span>ارسال به گروه روبیکا</span>
          </label>

          <button
            type="submit"
            disabled={isBusy || !commandText.trim()}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ساخت دکمه میانبر</span>
          </button>
        </div>
      </form>
    </section>
  );
};
