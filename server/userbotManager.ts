import {ChildProcess, execFile, spawn} from 'child_process';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SESSION_FILE = path.join(DATA_DIR, 'parya_userbot.rp');
const VENV_DIR = path.resolve(process.cwd(), '.py_userbot');
const VENV_BIN = path.join(VENV_DIR, 'bin');
const VENV_PYTHON = path.join(VENV_BIN, 'python');
const VENV_CFG = path.join(VENV_DIR, 'pyvenv.cfg');
const DAEMON_SCRIPT = path.resolve(process.cwd(), 'server', 'rubika_userbot_daemon.py');

export interface AudioLibraryEntry {
  name: string;
  installed: boolean;
  version?: string;
}

export interface UserbotAuthResult {
  ok: boolean;
  status?: string;
  phone?: string;
  phoneCodeHash?: string;
  hintPassKey?: string;
  accountName?: string;
  userGuid?: string;
  chatGuid?: string;
  chatType?: 'group' | 'channel';
  username?: string;
  title?: string;
  memberCount?: number;
  inviteLink?: string;
  audioLibs?: Record<string, {installed: boolean; version?: string}>;
  error?: string;
}

class UserbotManager {
  private daemonProc: ChildProcess | null = null;
  private lastLogs: string[] = [];
  private installingRuntime = false;
  private lastInstallError = '';

  private findSitePackagesDir(): string | null {
    const libDir = path.join(VENV_DIR, 'lib');
    if (!fs.existsSync(libDir)) return null;
    try {
      const pyDirs = fs.readdirSync(libDir).filter((d) => d.startsWith('python'));
      for (const pyDir of pyDirs) {
        const sp = path.join(libDir, pyDir, 'site-packages');
        if (fs.existsSync(sp)) return sp;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private ensureVenvHealthy(): void {
    try {
      if (fs.existsSync(VENV_DIR) && !fs.existsSync(VENV_CFG)) {
        fs.writeFileSync(
          VENV_CFG,
          'home = /usr/bin\ninclude-system-site-packages = false\nversion = 3.11.2\nexecutable = /usr/bin/python3.11\n',
          'utf-8',
        );
      }
      if (fs.existsSync(VENV_BIN)) {
        for (const f of ['python', 'python3', 'python3.11', 'pip', 'pip3']) {
          const p = path.join(VENV_BIN, f);
          if (fs.existsSync(p)) {
            fs.chmodSync(p, 0o755);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private buildPythonEnv(): NodeJS.ProcessEnv {
    const sp = this.findSitePackagesDir();
    const env = {...process.env};
    if (sp) {
      env.PYTHONPATH = env.PYTHONPATH ? `${sp}:${env.PYTHONPATH}` : sp;
    }
    return env;
  }

  private getPythonBin(): string {
    this.ensureVenvHealthy();
    if (fs.existsSync(VENV_PYTHON)) {
      return VENV_PYTHON;
    }
    return 'python3';
  }

  public hasSession(): boolean {
    return fs.existsSync(SESSION_FILE) && fs.statSync(SESSION_FILE).size > 0;
  }

  public isDaemonRunning(): boolean {
    return Boolean(this.daemonProc && !this.daemonProc.killed && this.daemonProc.exitCode === null);
  }

  public isRuntimeReady(): boolean {
    this.ensureVenvHealthy();
    const sp = this.findSitePackagesDir();
    return Boolean(
      fs.existsSync(VENV_PYTHON) &&
        fs.existsSync(DAEMON_SCRIPT) &&
        sp &&
        fs.existsSync(path.join(sp, 'rubpy')) &&
        fs.existsSync(path.join(sp, 'aiortc')) &&
        fs.existsSync(path.join(sp, 'av')),
    );
  }

  private appendLog(line: string): void {
    const clean = line.trim();
    if (!clean) return;
    this.lastLogs = [clean, ...this.lastLogs].slice(0, 30);
  }

  private runOneShot(args: string[]): Promise<UserbotAuthResult> {
    return new Promise((resolve) => {
      const pyBin = this.getPythonBin();
      execFile(
        pyBin,
        [DAEMON_SCRIPT, ...args],
        {
          cwd: process.cwd(),
          env: this.buildPythonEnv(),
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        },
        (err, stdout, stderr) => {
          const text = (stdout || '').trim();
          const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
          const lastLine = lines[lines.length - 1] || '';
          if (lastLine.startsWith('{')) {
            try {
              resolve(JSON.parse(lastLine) as UserbotAuthResult);
              return;
            } catch {
              // fall through
            }
          }
          resolve({
            ok: false,
            error:
              (stderr || '').trim() ||
              (err ? err.message : 'پاسخ نامعتبر از سرویس پایتون روبیکا'),
          });
        },
      );
    });
  }

  public async getAudioLibrariesStatus(): Promise<AudioLibraryEntry[]> {
    const res = await this.runOneShot(['--mode', 'status']);
    const libs = res.audioLibs;
    if (libs && typeof libs === 'object') {
      return Object.entries(libs).map(([name, info]) => ({
        name,
        installed: Boolean(info?.installed),
        version: info?.version || undefined,
      }));
    }
    const sp = this.findSitePackagesDir();
    const checkPkg = (pkg: string): AudioLibraryEntry => ({
      name: pkg,
      installed: Boolean(sp && fs.existsSync(path.join(sp, pkg))),
    });
    return [
      checkPkg('rubpy'),
      checkPkg('aiortc'),
      checkPkg('av'),
      checkPkg('yt_dlp'),
      checkPkg('mutagen'),
      checkPkg('pydub'),
      checkPkg('numpy'),
      {name: 'ffmpeg', installed: fs.existsSync('/usr/bin/ffmpeg')},
    ];
  }

  public async installAudioLibraries(): Promise<{
    ok: boolean;
    runtimeReady: boolean;
    audioLibs: AudioLibraryEntry[];
    error?: string;
  }> {
    if (this.installingRuntime) {
      return {
        ok: false,
        runtimeReady: this.isRuntimeReady(),
        audioLibs: await this.getAudioLibrariesStatus(),
        error: 'نصب کتابخانه‌های صدا در حال انجام است، لطفاً چند لحظه صبر کنید.',
      };
    }

    this.installingRuntime = true;
    this.lastInstallError = '';

    const cmd = [
      'rm -rf .py_userbot',
      'python3 -m venv --without-pip .py_userbot',
      'curl -sSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py',
      '.py_userbot/bin/python /tmp/get-pip.py --quiet',
      'rm -f /tmp/get-pip.py',
      '.py_userbot/bin/pip install --quiet --upgrade "rubpy[rtc]" aiohttp aiofiles yt-dlp mutagen pydub numpy',
    ].join(' && ');

    return new Promise((resolve) => {
      execFile(
        'bash',
        ['-c', cmd],
        {
          cwd: process.cwd(),
          timeout: 240000,
          maxBuffer: 2 * 1024 * 1024,
        },
        async (err, stdout, stderr) => {
          this.installingRuntime = false;
          if (stdout) this.appendLog(stdout);
          if (stderr) this.appendLog(stderr);
          this.ensureVenvHealthy();
          const audioLibs = await this.getAudioLibrariesStatus();
          const runtimeReady = this.isRuntimeReady();
          if (err && !runtimeReady) {
            this.lastInstallError = stderr?.trim() || err.message;
            resolve({
              ok: false,
              runtimeReady,
              audioLibs,
              error: this.lastInstallError,
            });
            return;
          }
          resolve({
            ok: runtimeReady,
            runtimeReady,
            audioLibs,
          });
        },
      );
    });
  }

  public async getSessionInfo(): Promise<{
    runtimeReady: boolean;
    hasSession: boolean;
    daemonRunning: boolean;
    installingRuntime: boolean;
    lastInstallError: string;
    audioLibs: AudioLibraryEntry[];
    accountName?: string;
    phone?: string;
    recentLogs: string[];
  }> {
    const runtimeReady = this.isRuntimeReady();
    const hasSession = this.hasSession();
    const daemonRunning = this.isDaemonRunning();

    if (daemonRunning) {
      const sp = this.findSitePackagesDir();
      const quickLibs: AudioLibraryEntry[] = [
        'rubpy',
        'aiortc',
        'av',
        'yt_dlp',
        'mutagen',
        'pydub',
        'numpy',
      ].map((pkg) => ({
        name: pkg,
        installed: Boolean(sp && fs.existsSync(path.join(sp, pkg))),
      }));
      quickLibs.push({name: 'ffmpeg', installed: fs.existsSync('/usr/bin/ffmpeg')});
      return {
        runtimeReady,
        hasSession,
        daemonRunning,
        installingRuntime: this.installingRuntime,
        lastInstallError: this.lastInstallError,
        audioLibs: quickLibs,
        recentLogs: this.lastLogs,
      };
    }

    const statusRes = await this.runOneShot(['--mode', 'status']);
    const audioLibs = statusRes.audioLibs
      ? Object.entries(statusRes.audioLibs).map(([name, info]) => ({
          name,
          installed: Boolean(info?.installed),
          version: info?.version || undefined,
        }))
      : await this.getAudioLibrariesStatus();

    return {
      runtimeReady: Boolean(runtimeReady && (statusRes.ok || audioLibs.every((l) => l.installed))),
      hasSession: Boolean(hasSession && statusRes.ok && (statusRes as unknown as {hasSession?: boolean}).hasSession),
      daemonRunning,
      installingRuntime: this.installingRuntime,
      lastInstallError: this.lastInstallError,
      audioLibs,
      accountName: statusRes.accountName,
      phone: statusRes.phone,
      recentLogs: this.lastLogs,
    };
  }

  public async sendCode(phone: string, passKey?: string): Promise<UserbotAuthResult> {
    const args = ['--mode', 'send-code', '--phone', phone.trim()];
    if (passKey && passKey.trim()) {
      args.push('--pass-key', passKey.trim());
    }
    return this.runOneShot(args);
  }

  public async signIn(
    phone: string,
    code: string,
    phoneCodeHash: string,
    serverPort = 3000,
  ): Promise<UserbotAuthResult> {
    const res = await this.runOneShot([
      '--mode',
      'sign-in',
      '--phone',
      phone.trim(),
      '--code',
      code.trim(),
      '--hash',
      phoneCodeHash.trim(),
    ]);
    if (res.ok) {
      this.startDaemon(serverPort);
    }
    return res;
  }

  public async joinTarget(target: string, serverPort = 3000): Promise<UserbotAuthResult> {
    return this.joinGroupByInvite(target, serverPort);
  }

  public async joinGroupByInvite(inviteLink: string, serverPort = 3000): Promise<UserbotAuthResult> {
    const cleanLink = inviteLink.trim();
    if (!cleanLink) {
      return {ok: false, error: 'لینک دعوت گروه یا آیدی کانال روبیکا الزامی است.'};
    }
    if (!this.isRuntimeReady()) {
      return {ok: false, error: 'کتابخانه‌های ویسکال هنوز آماده نیستند.'};
    }
    if (!this.hasSession()) {
      return {
        ok: false,
        error: 'برای عضویت خودکار، ابتدا اکانت Userbot روبیکا را با شماره موبایل متصل کنید.',
      };
    }
    const wasRunning = this.isDaemonRunning();
    if (wasRunning) {
      this.stopDaemon();
      await new Promise((r) => setTimeout(r, 350));
    }
    const res = await this.runOneShot(['--mode', 'join-group', '--link', cleanLink]);
    if (wasRunning || this.hasSession()) {
      this.startDaemon(serverPort);
    }
    return res;
  }

  public async logout(): Promise<void> {
    this.stopDaemon();
    await this.runOneShot(['--mode', 'logout']);
  }

  public startDaemon(serverPort = 3000): {started: boolean; reason?: string} {
    if (!this.isRuntimeReady()) {
      return {started: false, reason: 'کتابخانه‌های صدا/ویسکال روی سرور نصب نیستند.'};
    }
    if (!this.hasSession()) {
      return {started: false, reason: 'ابتدا با شماره موبایل اکانت Userbot روبیکا وارد شوید.'};
    }
    if (this.isDaemonRunning()) {
      return {started: true};
    }

    const pyBin = this.getPythonBin();
    const serverUrl = `http://127.0.0.1:${serverPort}`;
    const proc = spawn(pyBin, [DAEMON_SCRIPT, '--mode', 'run', '--server', serverUrl], {
      cwd: process.cwd(),
      env: this.buildPythonEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (chunk: Buffer) => {
      this.appendLog(chunk.toString('utf-8'));
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      this.appendLog(chunk.toString('utf-8'));
    });
    proc.on('exit', (code) => {
      this.appendLog(`Userbot daemon exited with code ${code}`);
      if (this.daemonProc === proc) {
        this.daemonProc = null;
      }
    });

    this.daemonProc = proc;
    return {started: true};
  }

  public stopDaemon(): void {
    if (this.daemonProc && !this.daemonProc.killed) {
      try {
        this.daemonProc.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    this.daemonProc = null;
  }

  public ensureRunningIfSessionExists(serverPort = 3000): void {
    if (this.isRuntimeReady() && this.hasSession() && !this.isDaemonRunning()) {
      this.startDaemon(serverPort);
    }
  }
}

export const userbotManager = new UserbotManager();
