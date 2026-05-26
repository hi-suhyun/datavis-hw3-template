import { useState, useEffect, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import './App.css';

const COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
];

const IMG_SIZE = 9;
const CELL = IMG_SIZE + 1; // 10px per grid cell

// Projection view dimensions
const PROJ_W = 420;
const PROJ_H = 420;
const PROJ_PAD = 15;
const DOT_R = 4;

// Score distribution dimensions
const DIST_W = 960;
const DIST_LEFT = 112;
const DIST_TOP = 26;
const BIN_W = (DIST_W - DIST_LEFT) / 10;
const ITEMS_PER_BIN_ROW = Math.floor(BIN_W / CELL); // items per horizontal row within a bin
const ROW_GAP = 10;
const SUB_GAP = 4;
const CLASS_HEADER_H = 20; // height reserved at top of each row for the class badge

export default function App() {
  const [items, setItems] = useState([]);
  const [hoveredId, setHoveredId] = useState(null);
  const [filterLabel, setFilterLabel] = useState(null);
  const [filterPredicted, setFilterPredicted] = useState(null);

  useEffect(() => {
    fetch('predictions.json')
      .then(r => r.json())
      .then(setItems);
  }, []);

  const hoveredItem = useMemo(
    () => (hoveredId != null ? items.find(d => d.id === hoveredId) ?? null : null),
    [items, hoveredId]
  );

  // Bin items per class for score distribution
  const classData = useMemo(() => {
    if (!items.length) return [];
    return Array.from({ length: 10 }, (_, cls) => {
      const lb = Array.from({ length: 10 }, () => []);
      const pb = Array.from({ length: 10 }, () => []);
      items.forEach(d => {
        const bin = Math.min(Math.floor(d.predicted_scores[cls] * 10), 9);
        if (d.true_label === cls) lb[bin].push(d);
        if (d.predicted_label === cls) pb[bin].push(d);
      });
      const mlb = Math.max(...lb.map(b => b.length), 1);
      const mpb = Math.max(...pb.map(b => b.length), 1);
      return { cls, lb, pb, mlb, mpb };
    });
  }, [items]);

  // Projection scales (computed from actual data range)
  const projScales = useMemo(() => {
    if (!items.length) return null;
    const xExt = d3.extent(items, d => d.projection[0]);
    const yExt = d3.extent(items, d => d.projection[1]);
    return {
      x: d3.scaleLinear().domain(xExt).range([PROJ_PAD, PROJ_W - PROJ_PAD]),
      y: d3.scaleLinear().domain(yExt).range([PROJ_PAD, PROJ_H - PROJ_PAD]),
    };
  }, [items]);

  // Compute layout (y positions) for each class row in score distribution
  const distRows = useMemo(() => {
    if (!classData.length) return null;
    let yOff = DIST_TOP + 4;
    const rows = classData.map(cd => {
      const lRows = Math.ceil(cd.mlb / ITEMS_PER_BIN_ROW);
      const pRows = Math.ceil(cd.mpb / ITEMS_PER_BIN_ROW);
      const lH = Math.max(lRows * CELL, 2 * CELL);
      const pH = Math.max(pRows * CELL, 2 * CELL);
      const row = {
        ...cd,
        y: yOff,
        lH,
        lY: yOff + CLASS_HEADER_H,          // labeled sub-row starts after class badge
        pY: yOff + CLASS_HEADER_H + lH + SUB_GAP,
        pH,
        total: CLASS_HEADER_H + lH + SUB_GAP + pH,
      };
      yOff += row.total + ROW_GAP;
      return row;
    });
    return { rows, totalH: yOff + 4 };
  }, [classData]);

  // Set of item IDs that match the current filter
  const activeIds = useMemo(() => {
    if (filterLabel == null && filterPredicted == null) return null;
    const s = new Set();
    items.forEach(d => {
      const labelOk = filterLabel == null || d.true_label === filterLabel;
      const predOk = filterPredicted == null || d.predicted_label === filterPredicted;
      if (labelOk && predOk) s.add(d.id);
    });
    return s;
  }, [items, filterLabel, filterPredicted]);

  const getOpacity = useCallback(
    id => {
      if (hoveredId != null) return id === hoveredId ? 1 : 0.1;
      if (activeIds != null) return activeIds.has(id) ? 1 : 0.18;
      return 0.8;
    },
    [hoveredId, activeIds]
  );

  const handleLabelClick = useCallback(cls => {
    setFilterLabel(prev => (prev === cls ? null : cls));
  }, []);

  const handlePredictedClick = useCallback(cls => {
    setFilterPredicted(prev => (prev === cls ? null : cls));
  }, []);

  if (!items.length || !distRows || !projScales) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  return (
    <>
      <h1>Data Visualization HW 3 Suhyun Kim</h1>
      <div id="container">
        <div id="sidebar">
          {/* Projection View */}
          <div id="projection-view" className="view-panel">
            <div className="view-title">Projection View</div>
            <svg width={PROJ_W} height={PROJ_H} style={{ display: 'block' }}>
              {/* Render hovered item last so it appears on top */}
              {[...items]
                .sort((a, b) => (a.id === hoveredId ? 1 : 0) - (b.id === hoveredId ? 1 : 0))
                .map(d => {
                  const isHov = d.id === hoveredId;
                  return (
                    <circle
                      key={d.id}
                      cx={projScales.x(d.projection[0])}
                      cy={projScales.y(d.projection[1])}
                      r={isHov ? DOT_R * 2.5 : DOT_R}
                      fill={COLORS[d.true_label]}
                      stroke={COLORS[d.predicted_label]}
                      strokeWidth={isHov ? 2.5 : 1}
                      opacity={getOpacity(d.id)}
                      style={{ cursor: 'pointer', transition: 'opacity 0.12s' }}
                      onMouseEnter={() => setHoveredId(d.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    />
                  );
                })}
            </svg>
          </div>

          {/* Selected Image Info */}
          <div id="selected-image-info" className="view-panel">
            <div className="view-title">Selected Image</div>
            <div id="selected-image-info-content">
              {hoveredItem ? (
                <>
                  <img
                    src={`/images/${hoveredItem.filename}`}
                    width={64}
                    height={64}
                    style={{
                      imageRendering: 'pixelated',
                      border: `3px solid ${COLORS[hoveredItem.true_label]}`,
                      marginRight: 14,
                      flexShrink: 0,
                    }}
                    alt={`digit ${hoveredItem.true_label}`}
                  />
                  <div style={{ fontSize: '0.82rem', lineHeight: 1.9 }}>
                    <div>
                      <strong>ID:</strong> {hoveredItem.id}
                    </div>
                    <div>
                      <strong>Labeled as</strong> {hoveredItem.true_label}
                    </div>
                    <div>
                      <strong>Predicted as</strong> {hoveredItem.predicted_label}{' '}
                      <span style={{ color: '#888', fontSize: '0.78rem' }}>
                        (Confidence:{' '}
                        {hoveredItem.predicted_scores[hoveredItem.predicted_label].toFixed(3)})
                      </span>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Score Distribution */}
        <div id="main-section">
          <div id="score-distribution" className="view-panel">
            <div className="view-title">Score Distributions</div>
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 80px)' }}>
              <svg width={DIST_W} height={distRows.totalH} style={{ display: 'block' }}>
                {/* X-axis */}
                <line x1={DIST_LEFT} y1={DIST_TOP} x2={DIST_W} y2={DIST_TOP} stroke="#ccc" />
                {Array.from({ length: 11 }, (_, i) => {
                  const tx = DIST_LEFT + i * BIN_W;
                  return (
                    <g key={i}>
                      <line x1={tx} y1={DIST_TOP - 4} x2={tx} y2={DIST_TOP} stroke="#bbb" />
                      <text x={tx} y={DIST_TOP - 7} textAnchor="middle" fontSize={10} fill="#666">
                        {(i / 10).toFixed(1)}
                      </text>
                    </g>
                  );
                })}

                {/* Class rows */}
                {distRows.rows.map(row => (
                  <DistRow
                    key={row.cls}
                    row={row}
                    filterLabel={filterLabel}
                    filterPredicted={filterPredicted}
                    onLabelClick={handleLabelClick}
                    onPredictedClick={handlePredictedClick}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    getOpacity={getOpacity}
                  />
                ))}

                {/* Parallel coordinate overlay on hover */}
                {hoveredItem && (
                  <PcpOverlay
                    hoveredItem={hoveredItem}
                    rows={distRows.rows}
                    totalH={distRows.totalH}
                  />
                )}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DistRow({
  row,
  filterLabel,
  filterPredicted,
  onLabelClick,
  onPredictedClick,
  hoveredId,
  setHoveredId,
  getOpacity,
}) {
  const { cls, y, lH, lY, pY, pH, lb, pb, total } = row;
  const lActive = filterLabel === cls;
  const pActive = filterPredicted === cls;

  return (
    <g>
      {/* Row separator */}
      <line
        x1={0}
        y1={y + total + ROW_GAP / 2}
        x2={DIST_W}
        y2={y + total + ROW_GAP / 2}
        stroke="#ececec"
      />

      {/* Vertical bin grid lines */}
      {Array.from({ length: 11 }, (_, i) => (
        <line
          key={i}
          x1={DIST_LEFT + i * BIN_W}
          y1={y}
          x2={DIST_LEFT + i * BIN_W}
          y2={y + total}
          stroke="#f5f5f5"
          strokeWidth={1}
        />
      ))}

      {/* Class badge — sits in its own header area above the sub-rows */}
      <text x={2} y={y + 14} fontSize={10.5} fontWeight="bold" fill="#444">
        Class
      </text>
      <rect x={37} y={y + 1} width={16} height={16} rx={2} fill={COLORS[cls]} />
      <text x={45} y={y + 13} fontSize={9.5} fill="white" textAnchor="middle" fontWeight="bold">
        {cls}
      </text>

      {/* "Labeled as X" — vertically centered in the labeled sub-row */}
      <text
        x={2}
        y={lY + lH / 2 + 4}
        fontSize={9.5}
        fill={lActive ? COLORS[cls] : '#555'}
        fontWeight={lActive ? 'bold' : 'normal'}
        textDecoration={lActive ? 'underline' : 'none'}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => onLabelClick(cls)}
      >
        Labeled as {cls}
      </text>

      {/* "Predicted as X" — vertically centered in the predicted sub-row */}
      <text
        x={2}
        y={pY + pH / 2 + 4}
        fontSize={9.5}
        fill={pActive ? COLORS[cls] : '#555'}
        fontWeight={pActive ? 'bold' : 'normal'}
        textDecoration={pActive ? 'underline' : 'none'}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => onPredictedClick(cls)}
      >
        Predicted as {cls}
      </text>

      {/* Labeled sub-row: items with true_label === cls */}
      {lb.flatMap((bin, bi) =>
        bin.map((item, ii) => {
          const col = ii % ITEMS_PER_BIN_ROW;
          const rowIdx = Math.floor(ii / ITEMS_PER_BIN_ROW);
          return (
            <ImageCell
              key={`l-${item.id}`}
              item={item}
              x={DIST_LEFT + bi * BIN_W + col * CELL}
              y={lY + lH - (rowIdx + 1) * CELL}
              hoveredId={hoveredId}
              setHoveredId={setHoveredId}
              opacity={getOpacity(item.id)}
            />
          );
        })
      )}

      {/* Predicted sub-row: items with predicted_label === cls */}
      {pb.flatMap((bin, bi) =>
        bin.map((item, ii) => {
          const col = ii % ITEMS_PER_BIN_ROW;
          const rowIdx = Math.floor(ii / ITEMS_PER_BIN_ROW);
          return (
            <ImageCell
              key={`p-${item.id}`}
              item={item}
              x={DIST_LEFT + bi * BIN_W + col * CELL}
              y={pY + pH - (rowIdx + 1) * CELL}
              hoveredId={hoveredId}
              setHoveredId={setHoveredId}
              opacity={getOpacity(item.id)}
            />
          );
        })
      )}
    </g>
  );
}

function ImageCell({ item, x, y, hoveredId, setHoveredId, opacity }) {
  const isHov = item.id === hoveredId;
  return (
    <g
      opacity={opacity}
      style={{ cursor: 'pointer', transition: 'opacity 0.12s' }}
      onMouseEnter={() => setHoveredId(item.id)}
      onMouseLeave={() => setHoveredId(null)}
    >
      <rect x={x} y={y} width={IMG_SIZE} height={IMG_SIZE} fill={COLORS[item.true_label]} />
      <image
        href={`/images/${item.filename}`}
        x={x}
        y={y}
        width={IMG_SIZE}
        height={IMG_SIZE}
        style={{ imageRendering: 'pixelated' }}
        pointerEvents="none"
      />
      {isHov && (
        <rect
          x={x - 1}
          y={y - 1}
          width={IMG_SIZE + 2}
          height={IMG_SIZE + 2}
          fill="none"
          stroke="#000"
          strokeWidth={1.5}
        />
      )}
    </g>
  );
}

// 90-degree rotated parallel coordinate plot shown on hover
function PcpOverlay({ hoveredItem, rows, totalH }) {
  const scores = hoveredItem.predicted_scores;
  const PCP_W = 130;
  const LABEL_W = 14;
  const AXIS_W = PCP_W - LABEL_W - 8;
  const ROW_H = 12;
  const PCP_H = 10 * ROW_H + 12;

  // Position near the row for the predicted label
  const targetRow = rows.find(r => r.cls === hoveredItem.predicted_label) || rows[0];
  const pcpX = DIST_W - PCP_W - 6;
  const pcpY = Math.min(targetRow.y, Math.max(DIST_TOP + 4, totalH - PCP_H - 10));

  // Points for connecting polyline
  const pts = Array.from({ length: 10 }, (_, i) => {
    const px = LABEL_W + 2 + scores[i] * AXIS_W;
    const py = 6 + i * ROW_H + ROW_H / 2;
    return `${px},${py}`;
  }).join(' ');

  return (
    <g transform={`translate(${pcpX}, ${pcpY})`} pointerEvents="none">
      <rect
        x={0}
        y={0}
        width={PCP_W}
        height={PCP_H}
        fill="white"
        stroke="#bbb"
        strokeWidth={1}
        rx={3}
        opacity={0.97}
      />
      {/* Axis tick at 1.0 */}
      <line
        x1={LABEL_W + 2 + AXIS_W}
        y1={4}
        x2={LABEL_W + 2 + AXIS_W}
        y2={PCP_H - 4}
        stroke="#eee"
        strokeWidth={1}
      />
      <text x={LABEL_W + 2 + AXIS_W} y={PCP_H - 1} fontSize={6.5} textAnchor="middle" fill="#aaa">
        1.0
      </text>
      {Array.from({ length: 10 }, (_, i) => {
        const rowY = 6 + i * ROW_H;
        const midY = rowY + ROW_H / 2;
        const dotX = LABEL_W + 2 + scores[i] * AXIS_W;
        return (
          <g key={i}>
            {/* Horizontal axis line per class */}
            <line
              x1={LABEL_W + 2}
              y1={midY}
              x2={LABEL_W + 2 + AXIS_W}
              y2={midY}
              stroke="#f0f0f0"
              strokeWidth={1}
            />
            {/* Class label */}
            <text
              x={LABEL_W}
              y={midY + 3.5}
              fontSize={7.5}
              textAnchor="end"
              fill={COLORS[i]}
              fontWeight="bold"
            >
              {i}
            </text>
            {/* Score dot */}
            <circle cx={dotX} cy={midY} r={3} fill={COLORS[i]} opacity={0.9} />
          </g>
        );
      })}
      {/* Polyline connecting scores across classes */}
      <polyline points={pts} fill="none" stroke="#888" strokeWidth={1} opacity={0.5} />
    </g>
  );
}
