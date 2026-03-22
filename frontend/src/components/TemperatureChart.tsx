import { useMemo } from "react";

import { getTimestampMs } from "../lib/time";
import type { ComparisonAlignment, TemperatureSample, ThermalEvent } from "../types/thermal";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 300;
const PLOT_LEFT = 68;
const PLOT_RIGHT = 20;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 52;
const PLOT_WIDTH = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const TICK_COUNT = 5;

const absoluteTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type Series = {
  label: string;
  colorClass: "primary" | "secondary";
  samples: TemperatureSample[];
  events?: ThermalEvent[];
};

type Props = {
  primary: Series;
  secondary?: Series;
  alignment?: ComparisonAlignment;
};

type Tick = {
  key: string;
  x?: number;
  y?: number;
  label: string;
};

type MarkerLine = {
  key: string;
  x: number;
  label: string;
  colorClass: "primary" | "secondary";
};

export function TemperatureChart({ primary, secondary, alignment = "absolute" }: Props) {
  const chartData = useMemo(() => buildChartData(primary, secondary, alignment), [primary, secondary, alignment]);

  if (chartData === null) {
    return <div className="chart-empty muted">Capture at least two usable samples to render the temperature graph.</div>;
  }

  return (
    <div className="chart-card">
      <div className="section-label">
        <h3>Temperature trace</h3>
        <div className="chart-legend chart-legend-wrap">
          <span><i className="legend-swatch nozzle" />{primary.label} nozzle</span>
          <span><i className="legend-swatch bed" />{primary.label} bed</span>
          {secondary ? <span><i className="legend-swatch secondary" />{secondary.label}</span> : null}
          <span className="muted">{alignment === "elapsed" ? "Aligned by elapsed time" : "Aligned by timestamp"}</span>
        </div>
      </div>
      <svg className="temperature-chart" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Temperature graph">
        {chartData.yTicks.map((tick) => (
          <g key={tick.key}>
            <line x1={PLOT_LEFT} y1={tick.y} x2={PLOT_LEFT + PLOT_WIDTH} y2={tick.y} className="chart-grid" />
            <text x={PLOT_LEFT - 10} y={tick.y} className="chart-tick chart-tick-y" textAnchor="end" dominantBaseline="middle">
              {tick.label}
            </text>
          </g>
        ))}
        {chartData.xTicks.map((tick) => (
          <g key={tick.key}>
            <line x1={tick.x} y1={PLOT_TOP} x2={tick.x} y2={PLOT_TOP + PLOT_HEIGHT} className="chart-grid chart-grid-vertical" />
            <text x={tick.x} y={PLOT_TOP + PLOT_HEIGHT + 22} className="chart-tick" textAnchor="middle">
              {tick.label}
            </text>
          </g>
        ))}
        <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={PLOT_TOP + PLOT_HEIGHT} className="chart-axis" />
        <line x1={PLOT_LEFT} y1={PLOT_TOP + PLOT_HEIGHT} x2={PLOT_LEFT + PLOT_WIDTH} y2={PLOT_TOP + PLOT_HEIGHT} className="chart-axis" />
        {chartData.markerLines.map((marker) => (
          <line
            key={marker.key}
            x1={marker.x}
            y1={PLOT_TOP}
            x2={marker.x}
            y2={PLOT_TOP + PLOT_HEIGHT}
            className={`chart-marker ${marker.colorClass}`}
          />
        ))}
        <polyline className="chart-line nozzle" fill="none" points={chartData.primaryNozzle} />
        <polyline className="chart-line bed" fill="none" points={chartData.primaryBed} />
        {secondary ? <polyline className="chart-line secondary" fill="none" points={chartData.secondaryNozzle} /> : null}
        {secondary ? <polyline className="chart-line secondary-dashed" fill="none" points={chartData.secondaryBed} /> : null}
        <text x={PLOT_LEFT + PLOT_WIDTH / 2} y={CHART_HEIGHT - 10} className="chart-axis-label" textAnchor="middle">
          Time
        </text>
        <text
          x={18}
          y={PLOT_TOP + PLOT_HEIGHT / 2}
          className="chart-axis-label"
          textAnchor="middle"
          transform={`rotate(-90 18 ${PLOT_TOP + PLOT_HEIGHT / 2})`}
        >
          Temperature (C)
        </text>
      </svg>
      {chartData.markerLines.length > 0 ? (
        <div className="marker-labels">
          {chartData.markerLines.map((marker) => (
            <span className={`marker-label ${marker.colorClass}`} key={`${marker.key}-label`}>
              {marker.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildChartData(primary: Series, secondary: Series | undefined, alignment: ComparisonAlignment) {
  const plottedPrimary = primary.samples.filter((sample) => sample.nozzle_actual !== null || sample.bed_actual !== null);
  const plottedSecondary = secondary ? secondary.samples.filter((sample) => sample.nozzle_actual !== null || sample.bed_actual !== null) : [];

  if (plottedPrimary.length < 2 && plottedSecondary.length < 2) {
    return null;
  }

  const allSamples = [...plottedPrimary, ...plottedSecondary];
  const primaryStart = primary.samples[0]?.captured_at;
  const secondaryStart = secondary?.samples[0]?.captured_at;
  const normalizedTimes = allSamples.map((sample) =>
    normalizeTime(sample.captured_at, alignment, primaryStart, secondaryStart, secondary?.samples.includes(sample) ?? false),
  );
  const minTime = Math.min(...normalizedTimes);
  const maxTime = Math.max(...normalizedTimes);
  const values = allSamples.flatMap((sample) => [sample.nozzle_actual, sample.bed_actual].filter((value): value is number => value !== null));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const paddedMin = Math.max(0, Math.floor(minValue - 5));
  const paddedMax = Math.ceil(maxValue + 5);
  const valueRange = Math.max(1, paddedMax - paddedMin);
  const timeRange = Math.max(1, maxTime - minTime);

  function toX(sampleTime: string, isSecondary = false) {
    const xValue = normalizeTime(sampleTime, alignment, primaryStart, secondaryStart, isSecondary);
    return PLOT_LEFT + ((xValue - minTime) / timeRange) * PLOT_WIDTH;
  }

  function toY(value: number) {
    return PLOT_TOP + PLOT_HEIGHT - ((value - paddedMin) / valueRange) * PLOT_HEIGHT;
  }

  function toPoint(sampleTime: string, value: number | null, isSecondary = false) {
    if (value === null) {
      return null;
    }
    return `${toX(sampleTime, isSecondary).toFixed(2)},${toY(value).toFixed(2)}`;
  }

  const primaryNozzle = plottedPrimary.map((sample) => toPoint(sample.captured_at, sample.nozzle_actual)).filter(Boolean).join(" ");
  const primaryBed = plottedPrimary.map((sample) => toPoint(sample.captured_at, sample.bed_actual)).filter(Boolean).join(" ");
  const secondaryNozzle = plottedSecondary.map((sample) => toPoint(sample.captured_at, sample.nozzle_actual, true)).filter(Boolean).join(" ");
  const secondaryBed = plottedSecondary.map((sample) => toPoint(sample.captured_at, sample.bed_actual, true)).filter(Boolean).join(" ");

  const yTicks = Array.from({ length: TICK_COUNT }, (_, index) => {
    const fraction = index / (TICK_COUNT - 1);
    const value = paddedMax - fraction * valueRange;
    return {
      key: `y-${index}`,
      y: PLOT_TOP + fraction * PLOT_HEIGHT,
      label: `${Math.round(value)}C`,
    } satisfies Tick;
  });

  const xTicks = Array.from({ length: TICK_COUNT }, (_, index) => {
    const fraction = index / (TICK_COUNT - 1);
    const value = minTime + fraction * timeRange;
    return {
      key: `x-${index}`,
      x: PLOT_LEFT + fraction * PLOT_WIDTH,
      label: formatTimeTick(value, alignment),
    } satisfies Tick;
  });

  const markerLines = [
    ...buildMarkerLines(primary.events ?? [], alignment, primary.label, "primary", minTime, timeRange, primaryStart, secondaryStart),
    ...buildMarkerLines(secondary?.events ?? [], alignment, secondary?.label ?? "", "secondary", minTime, timeRange, primaryStart, secondaryStart, true),
  ];

  return {
    primaryNozzle,
    primaryBed,
    secondaryNozzle,
    secondaryBed,
    xTicks,
    yTicks,
    markerLines,
  };
}

function buildMarkerLines(
  events: ThermalEvent[],
  alignment: ComparisonAlignment,
  labelPrefix: string,
  colorClass: "primary" | "secondary",
  minTime: number,
  timeRange: number,
  primaryStart: string | undefined,
  secondaryStart: string | undefined,
  secondarySeries = false,
): MarkerLine[] {
  return events.map((event) => {
    const xValue = normalizeTime(event.event_time, alignment, primaryStart, secondaryStart, secondarySeries);
    const x = PLOT_LEFT + ((xValue - minTime) / timeRange) * PLOT_WIDTH;
    return {
      key: `${colorClass}-${event.id}`,
      x,
      label: `${labelPrefix}: ${event.event_type}`,
      colorClass,
    };
  });
}

function normalizeTime(
  value: string,
  alignment: ComparisonAlignment,
  primaryStart: string | undefined,
  secondaryStart?: string,
  secondarySeries = false,
) {
  const raw = getTimestampMs(value);
  if (alignment === "absolute") {
    return raw;
  }

  const base = secondarySeries ? secondaryStart : primaryStart;
  return raw - getTimestampMs(base ?? value);
}

function formatTimeTick(value: number, alignment: ComparisonAlignment): string {
  if (alignment === "absolute") {
    return absoluteTimeFormatter.format(new Date(value));
  }

  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
