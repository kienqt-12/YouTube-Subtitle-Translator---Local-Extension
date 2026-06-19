import { useEffect, useState } from 'react';
import {
  Captions,
  CheckCircle2,
  CircleAlert,
  Languages,
  Palette,
  RefreshCw,
  Server,
  Type,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Slider } from '../../components/ui/slider';
import { Switch } from '../../components/ui/switch';
import { getSettings, saveSettings } from '../../lib/settings';
import {
  DEFAULT_SETTINGS,
  type ExtensionSettings,
  type RuntimeResponse,
} from '../../lib/types';

type BackendState = 'checking' | 'online' | 'offline';

const languages = [
  ['vi', 'Tiếng Việt'],
  ['en', 'English'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['zh-CN', '中文'],
];

export default function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [backend, setBackend] = useState<BackendState>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    getSettings().then(setSettings);
    checkBackend();
  }, []);

  async function checkBackend() {
    setBackend('checking');
    const response = (await browser.runtime.sendMessage({
      type: 'health',
    })) as RuntimeResponse;
    setBackend(response?.ok ? 'online' : 'offline');
  }

  async function update<K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K],
  ) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    await saveSettings({ [key]: value });
  }

  async function reloadCurrentVideo(forceRefresh = false) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes('youtube.com/')) {
      setMessage('Hãy mở một video YouTube trước.');
      return;
    }
    try {
      await browser.tabs.sendMessage(tab.id, {
        type: 'reload-subtitles',
        forceRefresh,
      });
      setMessage(forceRefresh ? 'Đang dịch lại video...' : 'Đã cập nhật phụ đề.');
    } catch {
      setMessage('Hãy tải lại trang YouTube rồi thử lại.');
    }
  }

  return (
    <main className="min-h-[600px] w-[390px] bg-slate-50 text-ink">
      <header className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 px-5 pb-6 pt-5 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <Captions size={24} />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight">Subtitle Translator AI</h1>
            <p className="mt-0.5 text-xs text-indigo-100">Phụ đề dịch trực tiếp trên YouTube</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-black/15 px-3 py-2.5 ring-1 ring-white/10">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Server size={16} /> Backend local
          </div>
          <button
            className="flex items-center gap-1.5 text-xs font-semibold"
            onClick={checkBackend}
          >
            {backend === 'online' ? (
              <><CheckCircle2 size={15} /> Đang chạy</>
            ) : backend === 'offline' ? (
              <><CircleAlert size={15} /> Chưa chạy</>
            ) : (
              <><RefreshCw className="animate-spin" size={14} /> Kiểm tra</>
            )}
          </button>
        </div>
      </header>

      <section className="-mt-2 space-y-3 px-4 pb-5">
        <SettingCard icon={<Captions size={18} />} title="Hiển thị">
          <SettingRow label="Bật phụ đề dịch">
            <Switch
              checked={settings.enabled}
              onCheckedChange={(value) => update('enabled', value)}
            />
          </SettingRow>
          <SettingRow label="Ẩn caption YouTube">
            <Switch
              checked={settings.hideNativeCaptions}
              onCheckedChange={(value) => update('hideNativeCaptions', value)}
            />
          </SettingRow>
        </SettingCard>

        <SettingCard icon={<Languages size={18} />} title="Ngôn ngữ và nhịp câu">
          <label className="block text-xs font-semibold text-slate-600">
            Ngôn ngữ đích
            <select
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
              value={settings.targetLanguage}
              onChange={(event) => update('targetLanguage', event.target.value)}
            >
              {languages.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Nhịp ngắt câu
            <select
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
              value={settings.pacing}
              onChange={(event) =>
                update('pacing', event.target.value as ExtensionSettings['pacing'])
              }
            >
              <option value="short">Ngắn, dễ đọc</option>
              <option value="natural">Tự nhiên (khuyên dùng)</option>
              <option value="long">Câu dài, liền ý</option>
            </select>
          </label>
        </SettingCard>

        <SettingCard icon={<Type size={18} />} title="Kiểu chữ">
          <div>
            <div className="mb-2 flex justify-between text-xs font-semibold text-slate-600">
              <span>Cỡ chữ</span><span>{settings.fontSize}px</span>
            </div>
            <Slider
              min={20}
              max={48}
              step={1}
              value={[settings.fontSize]}
              onValueChange={([value]) => update('fontSize', value)}
            />
          </div>
          <div>
            <div className="mb-2 flex justify-between text-xs font-semibold text-slate-600">
              <span>Độ đậm nền</span><span>{settings.backgroundOpacity}%</span>
            </div>
            <Slider
              min={0}
              max={95}
              step={5}
              value={[settings.backgroundOpacity]}
              onValueChange={([value]) => update('backgroundOpacity', value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Màu chữ
              <input
                type="color"
                className="mt-1.5 h-10 w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                value={settings.textColor}
                onChange={(event) => update('textColor', event.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Vị trí
              <select
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold"
                value={settings.position}
                onChange={(event) =>
                  update('position', event.target.value as ExtensionSettings['position'])
                }
              >
                <option value="bottom">Phía dưới</option>
                <option value="top">Phía trên</option>
              </select>
            </label>
          </div>
        </SettingCard>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button onClick={() => reloadCurrentVideo(false)}>
            <Palette size={16} /> Áp dụng vào video
          </Button>
          <Button
            variant="secondary"
            className="px-3"
            title="Dịch lại và bỏ qua cache"
            onClick={() => reloadCurrentVideo(true)}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
        {message && <p className="text-center text-xs font-semibold text-slate-500">{message}</p>}
        {backend === 'offline' && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            Chạy <strong>run_extension_backend.bat</strong> trong thư mục dự án, sau đó bấm kiểm tra lại.
          </p>
        )}
      </section>
    </main>
  );
}

function SettingCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-extrabold">
        <span className="text-primary">{icon}</span>{title}
      </div>
      {children}
    </div>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
      <span>{label}</span>{children}
    </div>
  );
}
