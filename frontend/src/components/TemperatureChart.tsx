import { useMemo } from "react";

import { getTimestampMs } from "../lib/time";
import type { ComparisonAlignment, TemperatureSample, ThermalEvent } from "../types/thermal";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 240;

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
        {chartData.gridLines.map((line) => (
          <line key={line.y} x1="0" y1={line.y} x2={CHART_WIDTH} y2={line.y} className="chart-grid" />
        ))}
        {chartData.markerLines.map((marker) => (
          <line key={marker.key} x1={marker.x} y1="0" x2={marker.x} y2={CHART_HEIGHT} className={`chart-marker ${marker.colorClass}`} />
        ))}
        <polyline className="chart-line nozzle" fill="none" points={chartData.primaryNozzle} />
        <polyline className="chart-line bed" fill="none" points={chartData.primaryBed} />
        {secondary ? <polyline className="chart-line secondary" fill="none" points={chartData.secondaryNozzle} /> : null}
        {secondary ? <polyline className="chart-line secondary-dashed" fill="none" points={chartData.secondaryBed} /> : null}
      </svg>
      <div className="chart-scale muted">
        <span>{chartData.minLabel}</span>
        <span>{chartData.maxLabel}</span>
      </div>
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
  const minX = Math.min(...normalizedTimes);
  const maxX = Math.max(...normalizedTimes);
  const values = allSamples.flatMap((sample) => [sample.nozzle_actual, sample.bed_actual].filter((value): value is number => value !== null));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const paddedMin = Math.max(0, Math.floor(minValue - 5));
  const paddedMax = Math.ceil(maxValue + 5);
  const valueRange = Math.max(1, paddedMax - paddedMin);
  const timeRange = Math.max(1, maxX - minX);

  function toPoint(sampleTime: string, value: number | null, isSecondary = false) {
    if (value === null) {
      return null;
    }
    const xValue = normalizeTime(sampleTime, alignment, primaryStart, secondaryStart, isSecondary);
    const x = ((xValue - minX) / timeRange) * CHART_WIDTH;
    const y = CHART_HEIGHT - ((value - paddedMin) / valueRange) * CHART_HEIGHT;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }

  const primaryNozzle = plottedPrimary.map((sample) => toPoint(sample.captured_at, sample.nozzle_actual)).filter(Boolean).join(" ");
  const primaryBed = plottedPrimary.map((sample) => toPoint(sample.captured_at, sample.bed_actual)).filter(Boolean).join(" ");
  const secondaryNozzle = plottedSecondary.map((sample) => toPoint(sample.captured_at, sample.nozzle_actual, true)).filter(Boolean).join(" ");
  const secondaryBed = plottedSecondary.map((sample) => toPoint(sample.captured_at, sample.bed_actual, true)).filter(Boolean).join(" ");
  const gridLines = Array.from({ length: 5 }, (_, index) => ({ y: (CHART_HEIGHT / 4) * index }));

  const markerLines = [
    ...buildMarkerLines(primary.events ?? [], alignment, primary.label, "primary", minX, timeRange, primaryStart, secondaryStart),
    ...buildMarkerLines(secondary?.events ?? [], alignment, secondary?.label ?? "", "secondary", minX, timeRange, primaryStart, secondaryStart, true),
  ];

  return {
    primaryNozzle,
    primaryBed,
    secondaryNozzle,
    secondaryBed,
    gridLines,
    markerLines,
    minLabel: `${paddedMin}C`,
    maxLabel: `${paddedMax}C`,
  };
}

function buildMarkerLines(
  events: ThermalEvent[],
  alignment: ComparisonAlignment,
  labelPrefix: string,
  colorClass: "primary" | "secondary",
  minX: number,
  timeRange: number,
  primaryStart: string | undefined,
  secondaryStart: string | undefined,
  secondarySeries = false,
) {
  return events.map((event) => {
    const xValue = normalizeTime(event.event_time, alignment, primaryStart, secondaryStart, secondarySeries);
    const x = ((xValue - minX) / timeRange) * CHART_WIDTH;
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
