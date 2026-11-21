import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as d3 from 'd3';
import {
  Activity,
  BarChart3,
  Clock,
  Disc3,
  Flame,
  Headphones,
  MessageSquareText,
  Music2,
  RefreshCw,
  Shuffle,
} from 'lucide-react';
import {GroupAnalyticsResponse, GroupState, HourlyAnalyticsBucket} from '../types/bot';

interface AnalyticsD3ViewProps {
  group: GroupState;
  isBusy: boolean;
  onQuickPlayRandom: () => Promise<void>;
  onNavigateToVoice: () => void;
}

type MetricMode = 'combined' | 'tracks' | 'commands';

interface TooltipState {
  bucket: HourlyAnalyticsBucket;
  x: number;
  y: number;
  isPeak: boolean;
}

function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('fa-IR', {hour: '2-digit', minute: '2-digit'});
}

function formatSourceLabel(mood?: string, source?: string): string {
  if (mood) return mood;
  if (source === 'direct') return 'لینک مستقیم';
  if (source === 'reply') return 'ریپلای ویسکال';
  return 'جستجوی آنلاین';
}

export const AnalyticsD3View: React.FC<AnalyticsD3ViewProps> = ({
  group,
  isBusy,
  onQuickPlayRandom,
  onNavigateToVoice,
}) => {
  const [analytics, setAnalytics] = useState<GroupAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricMode, setMetricMode] = useState<MetricMode>('combined');
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const barContainerRef = useRef<HTMLDivElement | null>(null);
  const barSvgRef = useRef<SVGSVGElement | null>(null);
  const moodContainerRef = useRef<HTMLDivElement | null>(null);
  const moodSvgRef = useRef<SVGSVGElement | null>(null);

  const [barWidth, setBarWidth] = useState(760);
  const [moodWidth, setMoodWidth] = useState(420);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(
        `/api/analytics?groupId=${encodeURIComponent(group.groupId)}&tzOffset=${tzOffset}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'خطا در دریافت آمار مصرف ربات.');
      } else {
        setAnalytics(data as GroupAnalyticsResponse);
      }
    } catch {
      setError('عدم دسترسی به سرویس آمار سرور.');
    } finally {
      setLoading(false);
    }
  }, [group.groupId]);

  // Refetch whenever active group, current track, history length, or chat commands update
  useEffect(() => {
    void fetchAnalytics();
  }, [
    fetchAnalytics,
    group.currentTrack?.id,
    group.history.length,
    group.messages.length,
    group.playbackEvents?.length,
  ]);

  // Responsive ResizeObserver for both D3 chart containers
  useEffect(() => {
    const observers: ResizeObserver[] = [];

    if (barContainerRef.current) {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.floor(entry.contentRect.width);
          if (w > 200) setBarWidth(w);
        }
      });
      ro.observe(barContainerRef.current);
      observers.push(ro);
    }

    if (moodContainerRef.current) {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.floor(entry.contentRect.width);
          if (w > 180) setMoodWidth(w);
        }
      });
      ro.observe(moodContainerRef.current);
      observers.push(ro);
    }

    return () => {
      observers.forEach((o) => o.disconnect());
    };
  }, [analytics]);

  // Compute active peak hour for the currently selected metric view
  const activePeakHour = useMemo(() => {
    if (!analytics) return null;
    let best: HourlyAnalyticsBucket | null = null;
    for (const b of analytics.hourly) {
      const val =
        metricMode === 'tracks'
          ? b.tracksPlayed
          : metricMode === 'commands'
            ? b.commandsCount
            : b.totalActivity;
      if (val <= 0) continue;
      const bestVal = best
        ? metricMode === 'tracks'
          ? best.tracksPlayed
          : metricMode === 'commands'
            ? best.commandsCount
            : best.totalActivity
        : 0;
      if (val > bestVal) {
        best = b;
      }
    }
    return best;
  }, [analytics, metricMode]);

  // Render 24-Hour Peak & Playback D3 Bar Chart
  useEffect(() => {
    if (!analytics || !barSvgRef.current) return;

    const data = analytics.hourly;
    const height = 310;
    const margin = {top: 28, right: 20, bottom: 38, left: 42};
    const innerWidth = Math.max(240, barWidth - margin.left - margin.right);
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(barSvgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${barWidth} ${height}`).attr('width', barWidth).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const getValue = (d: HourlyAnalyticsBucket): number => {
      if (metricMode === 'tracks') return d.tracksPlayed;
      if (metricMode === 'commands') return d.commandsCount;
      return d.totalActivity;
    };

    const maxVal = d3.max(data, getValue) || 0;
    const yMax = Math.max(4, maxVal + Math.ceil(maxVal * 0.18));

    const x = d3
      .scaleBand<string>()
      .domain(data.map((d) => String(d.hour).padStart(2, '0')))
      .range([0, innerWidth])
      .padding(0.28);

    const y = d3.scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]);

    // Horizontal dashed gridlines
    const yTicks = y.ticks(5);
    g.append('g')
      .attr('class', 'grid-lines')
      .selectAll('line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', '#1E293B')
      .attr('stroke-dasharray', '3,3');

    // X Axis (00..23 hours)
    const showEveryOther = barWidth < 560;
    const xAxis = d3
      .axisBottom(x)
      .tickFormat((val, idx) => (showEveryOther && idx % 2 === 1 ? '' : val));

    const xAxisG = g
      .append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);

    xAxisG.select('.domain').attr('stroke', '#334155');
    xAxisG.selectAll('.tick line').attr('stroke', '#334155');
    xAxisG
      .selectAll('.tick text')
      .attr('fill', '#94A3B8')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace');

    // Y Axis (Integer counts)
    const yAxis = d3
      .axisLeft(y)
      .ticks(5)
      .tickFormat((d) => (Number.isInteger(Number(d)) ? String(d) : ''));

    const yAxisG = g.append('g').call(yAxis);
    yAxisG.select('.domain').attr('stroke', '#334155');
    yAxisG.selectAll('.tick line').attr('stroke', '#334155');
    yAxisG
      .selectAll('.tick text')
      .attr('fill', '#94A3B8')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace');

    // Subtle baseline bars for zero-activity hours
    g.selectAll('.bar-base')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar-base')
      .attr('x', (d) => x(String(d.hour).padStart(2, '0')) ?? 0)
      .attr('y', innerHeight - 2)
      .attr('width', x.bandwidth())
      .attr('height', 2)
      .attr('rx', 1)
      .attr('fill', '#1E293B');

    const peakHourNum = activePeakHour?.hour ?? -1;

    if (metricMode === 'combined') {
      // Bottom segment: Tracks played in Voice Chat (Emerald, or Amber peak)
      g.selectAll('.bar-tracks')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar-tracks')
        .attr('x', (d) => x(String(d.hour).padStart(2, '0')) ?? 0)
        .attr('width', x.bandwidth())
        .attr('y', innerHeight)
        .attr('height', 0)
        .attr('rx', (d) => (d.commandsCount === 0 ? 4 : 0))
        .attr('fill', (d) => (d.hour === peakHourNum ? '#F59E0B' : '#10B981'))
        .transition()
        .duration(380)
        .attr('y', (d) => y(d.tracksPlayed))
        .attr('height', (d) => Math.max(0, innerHeight - y(d.tracksPlayed)));

      // Top segment: Group bot commands (Sky, or bright Amber highlight on peak)
      g.selectAll('.bar-cmds')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar-cmds')
        .attr('x', (d) => x(String(d.hour).padStart(2, '0')) ?? 0)
        .attr('width', x.bandwidth())
        .attr('y', (d) => y(d.tracksPlayed))
        .attr('height', 0)
        .attr('rx', 3)
        .attr('fill', (d) => (d.hour === peakHourNum ? '#FBBF24' : '#38BDF8'))
        .attr('fill-opacity', (d) => (d.hour === peakHourNum ? 0.85 : 0.78))
        .transition()
        .duration(380)
        .attr('y', (d) => y(d.totalActivity))
        .attr('height', (d) => Math.max(0, y(d.tracksPlayed) - y(d.totalActivity)));
    } else {
      const fillBase = metricMode === 'tracks' ? '#10B981' : '#38BDF8';
      g.selectAll('.bar-single')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar-single')
        .attr('x', (d) => x(String(d.hour).padStart(2, '0')) ?? 0)
        .attr('width', x.bandwidth())
        .attr('y', innerHeight)
        .attr('height', 0)
        .attr('rx', 4)
        .attr('fill', (d) => (d.hour === peakHourNum ? '#F59E0B' : fillBase))
        .transition()
        .duration(380)
        .attr('y', (d) => y(getValue(d)))
        .attr('height', (d) => Math.max(0, innerHeight - y(getValue(d))));
    }

    // Value labels above non-zero bars + Peak marker
    g.selectAll('.bar-label')
      .data(data.filter((d) => getValue(d) > 0))
      .enter()
      .append('text')
      .attr('x', (d) => (x(String(d.hour).padStart(2, '0')) ?? 0) + x.bandwidth() / 2)
      .attr('y', (d) => y(getValue(d)) - 6)
      .attr('text-anchor', 'middle')
      .attr('fill', (d) => (d.hour === peakHourNum ? '#FBBF24' : '#CBD5E1'))
      .attr('font-size', (d) => (d.hour === peakHourNum ? '11px' : '10px'))
      .attr('font-weight', (d) => (d.hour === peakHourNum ? '700' : '500'))
      .attr('font-family', 'JetBrains Mono, monospace')
      .text((d) => String(getValue(d)));

    // Peak hour callout tag
    if (activePeakHour && getValue(activePeakHour) > 0) {
      const px = (x(String(activePeakHour.hour).padStart(2, '0')) ?? 0) + x.bandwidth() / 2;
      const py = Math.max(12, y(getValue(activePeakHour)) - 19);
      g.append('text')
        .attr('x', px)
        .attr('y', py)
        .attr('text-anchor', 'middle')
        .attr('fill', '#F59E0B')
        .attr('font-size', '10px')
        .attr('font-weight', '700')
        .text('اوج');
    }

    // Interactive hover bands for every hour slot
    g.selectAll('.hover-band')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'hover-band')
      .attr('x', (d) => x(String(d.hour).padStart(2, '0')) ?? 0)
      .attr('y', 0)
      .attr('width', x.bandwidth())
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('mouseenter', function (_event, d) {
        d3.select(this).attr('fill', 'rgba(148, 163, 184, 0.08)');
        const bandX = (x(String(d.hour).padStart(2, '0')) ?? 0) + margin.left + x.bandwidth() / 2;
        const val = getValue(d);
        const topY = y(val) + margin.top;
        setTooltip({
          bucket: d,
          x: bandX,
          y: Math.max(16, topY - 10),
          isPeak: d.hour === peakHourNum && val > 0,
        });
      })
      .on('mouseleave', function () {
        d3.select(this).attr('fill', 'transparent');
        setTooltip(null);
      });
  }, [analytics, barWidth, metricMode, activePeakHour]);

  // Render Horizontal D3 Bar Chart for Genre / Mood Breakdown
  useEffect(() => {
    if (!analytics || !moodSvgRef.current) return;
    const items = analytics.moodBreakdown.slice(0, 7);
    const svg = d3.select(moodSvgRef.current);
    svg.selectAll('*').remove();

    if (items.length === 0) return;

    const rowHeight = 36;
    const margin = {top: 10, right: 34, bottom: 24, left: 108};
    const height = Math.max(150, items.length * rowHeight + margin.top + margin.bottom);
    const innerWidth = Math.max(120, moodWidth - margin.left - margin.right);
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${moodWidth} ${height}`).attr('width', moodWidth).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const maxCount = d3.max(items, (d) => d.count) || 1;
    const x = d3.scaleLinear().domain([0, maxCount]).nice().range([0, innerWidth]);
    const y = d3
      .scaleBand<string>()
      .domain(items.map((d) => d.mood))
      .range([0, innerHeight])
      .padding(0.28);

    const yAxisG = g.append('g').call(d3.axisLeft(y).tickSize(0));
    yAxisG.select('.domain').remove();
    yAxisG
      .selectAll('.tick text')
      .attr('fill', '#E2E8F0')
      .attr('font-size', '12px')
      .attr('dx', '-6');

    g.selectAll('.mood-bg')
      .data(items)
      .enter()
      .append('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.mood) ?? 0)
      .attr('width', innerWidth)
      .attr('height', y.bandwidth())
      .attr('rx', 4)
      .attr('fill', '#0B0F17');

    g.selectAll('.mood-bar')
      .data(items)
      .enter()
      .append('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.mood) ?? 0)
      .attr('height', y.bandwidth())
      .attr('width', 0)
      .attr('rx', 4)
      .attr('fill', (_d, idx) => (idx === 0 ? '#F59E0B' : '#10B981'))
      .transition()
      .duration(360)
      .attr('width', (d) => Math.max(4, x(d.count)));

    g.selectAll('.mood-count')
      .data(items)
      .enter()
      .append('text')
      .attr('x', (d) => Math.min(innerWidth + 24, x(d.count) + 8))
      .attr('y', (d) => (y(d.mood) ?? 0) + y.bandwidth() / 2 + 4)
      .attr('fill', '#CBD5E1')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text((d) => String(d.count));
  }, [analytics, moodWidth]);

  const summary = analytics?.summary;
  const hasAnyData = Boolean(
    summary && (summary.totalTracksPlayed > 0 || summary.totalCommands > 0),
  );

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-emerald-400 shrink-0" />
            <h2 className="text-base font-bold text-slate-100">
              نمودار D3.js آمار پخش ویس‌چت و ساعات اوج مصرف ربات
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            گروه فعال: <span className="text-slate-200 font-medium">{group.title}</span> · توزیع
            ۲۴ ساعته بر اساس رویدادهای واقعی پخش آهنگ و دستورات کاربران به وقت محلی
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#0B0F17] border border-slate-800 rounded-lg p-1 text-xs">
            {(
              [
                {key: 'combined', label: 'کل فعالیت'},
                {key: 'tracks', label: 'آهنگ‌های ویس‌چت'},
                {key: 'commands', label: 'دستورات ربات'},
              ] as Array<{key: MetricMode; label: string}>
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMetricMode(opt.key)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  metricMode === opt.key
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void fetchAnalytics()}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>به‌روزرسانی آمار</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Empty-State Helper (never fabricates fake chart values) */}
      {!loading && !hasAnyData && (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-100">
              هنوز پخش آهنگ یا دستوری در این گروه ثبت نشده است
            </p>
            <p className="text-xs text-slate-400">
              با پخش اولین آهنگ در ویس‌چت یا ارسال دستور در چت گروهی، نمودار میله‌ای ۲۴ ساعته و
              ساعت اوج مصرف ربات به‌صورت واقعی رسم می‌شود.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void onQuickPlayRandom()}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>پخش رندوم در ویس‌چت</span>
            </button>
            <button
              type="button"
              onClick={onNavigateToVoice}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>رفتن به ویسکال</span>
            </button>
          </div>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>آهنگ‌های پخش‌شده در ویس‌چت</span>
            <Disc3 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-slate-100 font-mono tabular-nums">
            {summary?.totalTracksPlayed ?? 0}
          </p>
          <p className="text-xs text-slate-400">
            کل پخش‌های ثبت‌شده در گروه فعال
          </p>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>ساعت اوج مصرف ربات</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 font-mono tabular-nums">
            {summary?.peakHour ? summary.peakHour.label : '--:--'}
          </p>
          <p className="text-xs text-slate-400 tabular-nums">
            {summary?.peakHour
              ? `${summary.peakHour.tracksPlayed} آهنگ · ${summary.peakHour.commandsCount} دستور`
              : 'در انتظار ثبت اولین فعالیت'}
          </p>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>دستورات کاربران در چت</span>
            <MessageSquareText className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-2xl font-bold text-slate-100 font-mono tabular-nums">
            {summary?.totalCommands ?? 0}
          </p>
          <p className="text-xs text-slate-400">
            مجموع دستورات دریافتی از اعضا
          </p>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>ساعات فعال در شبانه‌روز</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-slate-100 font-mono tabular-nums">
            {summary?.activeHoursCount ?? 0}
            <span className="text-xs font-normal text-slate-400 mr-1.5">ساعت از ۲۴</span>
          </p>
          <p className="text-xs text-slate-400 tabular-nums">
            میانگین {summary?.avgPerActiveHour ?? 0} رویداد در هر ساعت فعال
          </p>
        </div>
      </div>

      {/* Main 24-Hour D3.js Bar Chart Card */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              نمودار میله‌ای ۲۴ ساعته پخش آهنگ و دستورات ربات
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              محور افقی: ساعت شبانه‌روز (۰۰ تا ۲۳) · محور عمودی: تعداد واقعی پخش و دستورات
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
            {(metricMode === 'combined' || metricMode === 'tracks') && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                <span>آهنگ پخش‌شده</span>
              </span>
            )}
            {(metricMode === 'combined' || metricMode === 'commands') && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block" />
                <span>دستور کاربر</span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
              <span>ساعت اوج مصرف</span>
            </span>
          </div>
        </div>

        {/* D3 SVG Wrapper (LTR so 00..23 hours progress left-to-right cleanly) */}
        <div ref={barContainerRef} dir="ltr" className="relative w-full min-h-[310px]">
          <svg ref={barSvgRef} className="w-full block overflow-visible" />

          {/* Interactive Hover Tooltip */}
          {tooltip && (
            <div
              dir="rtl"
              style={{
                left: `${Math.min(Math.max(96, tooltip.x), barWidth - 96)}px`,
                top: `${Math.max(8, tooltip.y)}px`,
                transform: 'translate(-50%, -100%)',
              }}
              className="pointer-events-none absolute z-20 w-48 bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2.5 shadow-xl text-xs space-y-1"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                <span className="font-mono tabular-nums font-bold text-slate-100">
                  ساعت {tooltip.bucket.label}
                </span>
                {tooltip.isPeak && (
                  <span className="text-amber-400 font-semibold">اوج مصرف</span>
                )}
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>آهنگ ویس‌چت:</span>
                <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                  {tooltip.bucket.tracksPlayed}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>دستور کاربر:</span>
                <span className="font-mono tabular-nums text-sky-400 font-semibold">
                  {tooltip.bucket.commandsCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-200 pt-0.5 border-t border-slate-800/80">
                <span>مجموع:</span>
                <span className="font-mono tabular-nums font-bold">
                  {tooltip.bucket.totalActivity}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Secondary Row: Mood D3 Horizontal Bar Chart + Recent Plays Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 5 Cols: Mood/Genre D3 Horizontal Bar Chart */}
        <section className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-100">
                توزیع سبک آهنگ‌های پخش‌شده (D3)
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              {analytics?.moodBreakdown.length ?? 0} سبک
            </span>
          </div>

          {analytics && analytics.moodBreakdown.length > 0 ? (
            <div ref={moodContainerRef} dir="ltr" className="w-full">
              <svg ref={moodSvgRef} className="w-full block" />
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-500">
              پس از پخش آهنگ در ویس‌چت، سهم هر سبک یا منبع با نمودار D3 نمایش داده می‌شود.
            </div>
          )}
        </section>

        {/* Right 7 Cols: Recent Voice Chat Playback Log */}
        <section className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-bold text-slate-100">آخرین آهنگ‌های پخش‌شده در ویس‌چت</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              {analytics?.recentPlays.length ?? 0} مورد اخیر
            </span>
          </div>

          {analytics && analytics.recentPlays.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-2.5 font-medium">نام آهنگ</th>
                    <th className="pb-2.5 font-medium">سبک / منبع</th>
                    <th className="pb-2.5 font-medium">درخواست‌کننده</th>
                    <th className="pb-2.5 font-medium text-left">ساعت پخش</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {analytics.recentPlays.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 pl-3">
                        <p className="text-slate-100 font-medium truncate max-w-[200px]">
                          {evt.title}
                        </p>
                        <p className="text-slate-400 truncate max-w-[200px]">{evt.artist}</p>
                      </td>
                      <td className="py-2.5 pl-3 text-emerald-300 whitespace-nowrap">
                        {formatSourceLabel(evt.mood, evt.source)}
                      </td>
                      <td className="py-2.5 pl-3 text-slate-300 whitespace-nowrap">
                        {evt.requestedBy}
                      </td>
                      <td className="py-2.5 text-left font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {formatLocalTime(evt.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-500">
              هنوز سابقه پخشی برای نمایش در جدول ثبت نشده است.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
