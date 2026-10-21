const svg = document.getElementById('planCanvas');
const snapSlider = document.getElementById('snapSize');
const snapValue = document.getElementById('snapValue');
const clearCanvasButton = document.getElementById('clearCanvas');
const exportButton = document.getElementById('exportSvg');
const generatePlanButton = document.getElementById('generatePlan');
const groundAreaInput = document.getElementById('groundArea');
const bedroomCountInput = document.getElementById('bedroomCount');
const bathroomCountInput = document.getElementById('bathroomCount');
const materialResults = document.getElementById('materialResults');

const state = {
  tool: 'wall',
  snap: Number(snapSlider.value),
  viewMode: '2d',
  walls: [],
  rooms: [],
  labels: [],
  dimensions: [],
  openings: [],
  setbacks: [],
  draft: null,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function snap(value) {
  return Math.round(value / state.snap) * state.snap;
}

function setTool(toolName) {
  if (state.viewMode !== '2d') {
    return;
  }

  state.tool = toolName;
  state.draft = null;

  document.querySelectorAll('.tool-button').forEach((button) => {
    const isActive = button.dataset.tool === toolName;
    button.classList.toggle('active', isActive);
  });

  render();
}

function setViewMode(viewMode) {
  state.viewMode = viewMode;

  document.querySelectorAll('.view-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewMode);
  });

  document.querySelectorAll('.tool-button').forEach((button) => {
    button.disabled = viewMode !== '2d';
    button.style.opacity = viewMode === '2d' ? '1' : '0.55';
  });

  render();
}

function getSvgPoint(event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(svg.getScreenCTM().inverse());
  return { x: transformed.x, y: transformed.y };
}

function normalizeRoomRect(draft) {
  const x = Math.min(draft.x, draft.x + draft.w);
  const y = Math.min(draft.y, draft.y + draft.h);
  const width = Math.abs(draft.w);
  const height = Math.abs(draft.h);
  return { x, y, width, height };
}

function addWall(x1, y1, x2, y2) {
  state.walls.push({ x1, y1, x2, y2 });
}

function addRoom(rect) {
  state.rooms.push({
    ...rect,
    name: `Room ${state.rooms.length + 1}`,
  });
}

function addLabel(x, y, labelText) {
  state.labels.push({ x, y, text: labelText });
}

function addDimension(start, end, text, orientation = 'horizontal') {
  state.dimensions.push({ start, end, text, orientation });
}

function addOpening(x, y, width, height, label, orientation = 'door') {
  state.openings.push({ x, y, width, height, label, orientation });
}

function getPlanEnvelope() {
  if (!state.rooms.length) {
    return { minX: 120, minY: 80, maxX: 960, maxY: 640, width: 840, height: 560 };
  }

  const xs = [];
  const ys = [];

  state.rooms.forEach((room) => {
    xs.push(room.x, room.x + room.width);
    ys.push(room.y, room.y + room.height);
  });

  const minX = Math.min(...xs) - 40;
  const minY = Math.min(...ys) - 40;
  const maxX = Math.max(...xs) + 40;
  const maxY = Math.max(...ys) + 40;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function addArchitecturalAnnotations() {
  state.dimensions = [];
  state.openings = [];
  state.setbacks = [];

  const envelope = getPlanEnvelope();
  const left = envelope.minX;
  const right = envelope.maxX;
  const top = envelope.minY;
  const bottom = envelope.maxY;
  const widthMeters = (envelope.width / 30).toFixed(1);
  const heightMeters = (envelope.height / 30).toFixed(1);

  addDimension({ x: left, y: top - 26 }, { x: right, y: top - 26 }, `${widthMeters}m`, 'horizontal');
  addDimension({ x: right + 26, y: top }, { x: right + 26, y: bottom }, `${heightMeters}m`, 'vertical');

  const setbackInset = 20;
  state.setbacks = [
    { x1: left + setbackInset, y1: top + setbackInset, x2: right - setbackInset, y2: top + setbackInset },
    { x1: left + setbackInset, y1: bottom - setbackInset, x2: right - setbackInset, y2: bottom - setbackInset },
    { x1: left + setbackInset, y1: top + setbackInset, x2: left + setbackInset, y2: bottom - setbackInset },
    { x1: right - setbackInset, y1: top + setbackInset, x2: right - setbackInset, y2: bottom - setbackInset },
  ];

  state.rooms.forEach((room, index) => {
    const widthMetersRoom = (room.width / 30).toFixed(1);
    const heightMetersRoom = (room.height / 30).toFixed(1);

    addDimension(
      { x: room.x, y: room.y - 18 },
      { x: room.x + room.width, y: room.y - 18 },
      `${widthMetersRoom}m`,
      'horizontal',
    );

    addDimension(
      { x: room.x + room.width + 18, y: room.y },
      { x: room.x + room.width + 18, y: room.y + room.height },
      `${heightMetersRoom}m`,
      'vertical',
    );

    if (index % 2 === 0) {
      addOpening(room.x + 10, room.y + 2, 30, 8, 'D', 'door');
    } else {
      addOpening(room.x + room.width - 40, room.y + 2, 22, 8, 'W', 'window');
    }
  });
}

function estimateMaterials(groundArea, bedroomCount, bathroomCount) {
  const area = clamp(Number(groundArea) || 1800, 80, 5000);
  const bedrooms = clamp(Number(bedroomCount) || 3, 1, 6);
  const bathrooms = clamp(Number(bathroomCount) || 2, 1, 5);

  const wallHeight = 3.1;
  const wallThickness = 0.23;
  const openingRatio = 0.18;
  const effectivePerimeter = 2 * (Math.sqrt(area) * 1.6 + 11 + bedrooms * 1.25 + bathrooms * 0.8);
  const totalWallArea = effectivePerimeter * wallHeight * (1 - openingRatio);
  const bricks = Math.round((totalWallArea * wallThickness / 0.0018) * 1.12);
  const cementBags = Math.round(((totalWallArea * 0.1) / 0.035) * 1.25);
  const sandVolume = (totalWallArea * 0.04).toFixed(1);
  const concreteVolume = (area * 0.12 + bedrooms * 1.6 + bathrooms * 0.8).toFixed(1);
  const steelTonnage = (area * 0.006 + bedrooms * 0.12).toFixed(1);

  return {
    area,
    bedrooms,
    bathrooms,
    bricks,
    cement: cementBags,
    sand: sandVolume,
    concrete: concreteVolume,
    steel: steelTonnage,
  };
}

function renderMaterialEstimate() {
  const estimate = estimateMaterials(
    groundAreaInput.value,
    bedroomCountInput.value,
    bathroomCountInput.value,
  );

  materialResults.innerHTML = `
    <div class="material-stat"><span>Ground area</span><strong>${estimate.area} m²</strong></div>
    <div class="material-stat"><span>Bricks</span><strong>${formatNumber(estimate.bricks)}</strong></div>
    <div class="material-stat"><span>Cement</span><strong>${formatNumber(estimate.cement)} bags</strong></div>
    <div class="material-stat"><span>Sand</span><strong>${estimate.sand} m³</strong></div>
    <div class="material-stat"><span>Concrete</span><strong>${estimate.concrete} m³</strong></div>
    <div class="material-stat"><span>Steel</span><strong>${estimate.steel} tonnes</strong></div>
  `;
}

function generateSmartPlan() {
  const groundArea = clamp(Number(groundAreaInput.value) || 1800, 80, 5000);
  const bedrooms = clamp(Number(bedroomCountInput.value) || 3, 1, 6);
  const bathrooms = clamp(Number(bathroomCountInput.value) || 2, 1, 5);

  state.walls = [];
  state.labels = [];

  const roomSpecs = [];
  roomSpecs.push({ name: 'Living', size: groundArea * 0.22 });
  roomSpecs.push({ name: 'Dining', size: groundArea * 0.12 });
  roomSpecs.push({ name: 'Kitchen', size: groundArea * 0.1 });

  for (let i = 1; i <= bedrooms; i += 1) {
    roomSpecs.push({
      name: i === 1 ? 'Master Bedroom' : `Bedroom ${i}`,
      size: groundArea * (i === 1 ? 0.18 : 0.14),
    });
  }

  for (let i = 1; i <= bathrooms; i += 1) {
    roomSpecs.push({ name: i === 1 ? 'Bath' : `Bath ${i}`, size: groundArea * 0.045 });
  }

  roomSpecs.push({ name: 'Utility', size: groundArea * 0.09 });

  const startX = 120;
  const startY = 90;
  const roomGap = 24;
  const cols = 3;

  let cursorX = startX;
  let cursorY = startY;
  let rowMaxHeight = 0;
  const generatedRooms = [];

  roomSpecs.forEach((room) => {
    const width = clamp(Math.sqrt(room.size) * 1.6, 100, 220);
    const height = clamp(Math.sqrt(room.size) * 1.25, 70, 180);

    if (generatedRooms.length > 0 && (generatedRooms.length % cols === 0)) {
      cursorX = startX;
      cursorY += rowMaxHeight + roomGap;
      rowMaxHeight = 0;
    }

    generatedRooms.push({
      x: cursorX,
      y: cursorY,
      width,
      height,
      name: room.name,
    });

    cursorX += width + roomGap;
    rowMaxHeight = Math.max(rowMaxHeight, height);
  });

  state.rooms = generatedRooms.map((room) => ({
    x: room.x,
    y: room.y,
    width: room.width,
    height: room.height,
    name: room.name,
  }));

  state.labels = state.rooms.map((room) => ({
    x: room.x + room.width / 2,
    y: room.y + room.height / 2,
    text: room.name,
  }));

  addArchitecturalAnnotations();
  render();
  renderMaterialEstimate();
}

function polygonPoints(points) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function project2D(x, y) {
  return { x, y };
}

function projectIsometric(x, y, z = 0) {
  return {
    x: (x - y) * 0.8 + 520,
    y: (x + y) * 0.42 - z + 180,
  };
}

function projectFront(x, y, z = 0) {
  return {
    x,
    y: 680 - y - z,
  };
}

function projectSide(x, y, z = 0) {
  return {
    x: x + z,
    y: 700 - y,
  };
}

function createDimensionMarkup() {
  return state.dimensions
    .map((dimension) => {
      const start = dimension.start;
      const end = dimension.end;
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;

      if (dimension.orientation === 'horizontal') {
        return `
          <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#f8fafc" stroke-width="1.5" />
          <line x1="${start.x}" y1="${start.y - 6}" x2="${start.x}" y2="${start.y + 6}" stroke="#f8fafc" stroke-width="1.5" />
          <line x1="${end.x}" y1="${end.y - 6}" x2="${end.x}" y2="${end.y + 6}" stroke="#f8fafc" stroke-width="1.5" />
          <text x="${midX}" y="${midY - 8}" fill="#f8fafc" font-size="12" text-anchor="middle">${dimension.text}</text>
        `;
      }

      return `
        <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#f8fafc" stroke-width="1.5" />
        <line x1="${start.x - 6}" y1="${start.y}" x2="${start.x + 6}" y2="${start.y}" stroke="#f8fafc" stroke-width="1.5" />
        <line x1="${end.x - 6}" y1="${end.y}" x2="${end.x + 6}" y2="${end.y}" stroke="#f8fafc" stroke-width="1.5" />
        <text x="${midX + 10}" y="${midY}" fill="#f8fafc" font-size="12" text-anchor="middle" transform="rotate(-90 ${midX + 10} ${midY})">${dimension.text}</text>
      `;
    })
    .join('');
}

function createSetbackMarkup() {
  return state.setbacks
    .map(
      (line) => `
        <line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="rgba(125,211,252,0.8)" stroke-width="1" stroke-dasharray="6 6" />
      `,
    )
    .join('');
}

function createOpeningMarkup() {
  return state.openings
    .map(
      (opening) => `
        <g>
          <rect x="${opening.x}" y="${opening.y}" width="${opening.width}" height="${opening.height}" fill="rgba(96,165,250,0.18)" stroke="rgba(96,165,250,0.8)" stroke-width="1.5" rx="3" />
          <text x="${opening.x + opening.width / 2}" y="${opening.y + opening.height / 2 + 3}" fill="#dbeafe" font-size="9" text-anchor="middle">${opening.label}</text>
        </g>
      `,
    )
    .join('');
}

function create3DFloorMarkup(mode) {
  const { minX, minY, maxX, maxY } = getPlanEnvelope();
  const wallHeight = 170;

  const floorPoints = [
    { x: minX, y: minY, z: 0 },
    { x: maxX, y: minY, z: 0 },
    { x: maxX, y: maxY, z: 0 },
    { x: minX, y: maxY, z: 0 },
  ].map((point) => {
    if (mode === 'front') return projectFront(point.x, point.y, point.z);
    if (mode === 'side') return projectSide(point.x, point.y, point.z);
    if (mode === 'isometric') return projectIsometric(point.x, point.y, point.z);
    return project2D(point.x, point.y);
  });

  const frontFace = [
    { x: minX, y: minY, z: 0 },
    { x: maxX, y: minY, z: 0 },
    { x: maxX, y: minY, z: wallHeight },
    { x: minX, y: minY, z: wallHeight },
  ].map((point) => {
    if (mode === 'front') return projectFront(point.x, point.y, point.z);
    if (mode === 'side') return projectSide(point.x, point.y, point.z);
    if (mode === 'isometric') return projectIsometric(point.x, point.y, point.z);
    return project2D(point.x, point.y);
  });

  const sideFace = [
    { x: maxX, y: minY, z: 0 },
    { x: maxX, y: maxY, z: 0 },
    { x: maxX, y: maxY, z: wallHeight },
    { x: maxX, y: minY, z: wallHeight },
  ].map((point) => {
    if (mode === 'front') return projectFront(point.x, point.y, point.z);
    if (mode === 'side') return projectSide(point.x, point.y, point.z);
    if (mode === 'isometric') return projectIsometric(point.x, point.y, point.z);
    return project2D(point.x, point.y);
  });

  const roofFace = [
    { x: minX, y: minY, z: wallHeight },
    { x: maxX, y: minY, z: wallHeight },
    { x: maxX, y: maxY, z: wallHeight },
    { x: minX, y: maxY, z: wallHeight },
  ].map((point) => {
    if (mode === 'front') return projectFront(point.x, point.y, point.z);
    if (mode === 'side') return projectSide(point.x, point.y, point.z);
    if (mode === 'isometric') return projectIsometric(point.x, point.y, point.z);
    return project2D(point.x, point.y);
  });

  const topRooms = state.rooms
    .map((room) => {
      const topRect = [
        { x: room.x, y: room.y, z: 0 },
        { x: room.x + room.width, y: room.y, z: 0 },
        { x: room.x + room.width, y: room.y + room.height, z: 0 },
        { x: room.x, y: room.y + room.height, z: 0 },
      ].map((point) => {
        if (mode === 'top') return project2D(point.x, point.y);
        if (mode === 'front') return projectFront(point.x, point.y, 0);
        if (mode === 'side') return projectSide(point.x, point.y, 0);
        if (mode === 'isometric') return projectIsometric(point.x, point.y, 0);
        return project2D(point.x, point.y);
      });

      return `<polygon points="${polygonPoints(topRect)}" fill="rgba(125,211,252,0.18)" stroke="rgba(125,211,252,0.9)" stroke-width="2" />`;
    })
    .join('');

  if (mode === 'front') {
    return `
      <polygon points="${polygonPoints(frontFace)}" fill="rgba(52,211,153,0.22)" stroke="rgba(52,211,153,0.95)" stroke-width="2" />
      <polygon points="${polygonPoints(sideFace)}" fill="rgba(148,163,184,0.22)" stroke="rgba(148,163,184,0.9)" stroke-width="2" />
      <polygon points="${polygonPoints(roofFace)}" fill="rgba(125,211,252,0.18)" stroke="rgba(125,211,252,0.9)" stroke-width="2" />
      <text x="470" y="90" fill="#e5eefb" font-size="18" font-weight="700">Front elevation</text>
    `;
  }

  if (mode === 'side') {
    return `
      <polygon points="${polygonPoints(sideFace)}" fill="rgba(52,211,153,0.22)" stroke="rgba(52,211,153,0.95)" stroke-width="2" />
      <polygon points="${polygonPoints(frontFace)}" fill="rgba(148,163,184,0.22)" stroke="rgba(148,163,184,0.9)" stroke-width="2" />
      <polygon points="${polygonPoints(roofFace)}" fill="rgba(125,211,252,0.18)" stroke="rgba(125,211,252,0.9)" stroke-width="2" />
      <text x="470" y="90" fill="#e5eefb" font-size="18" font-weight="700">Side elevation</text>
    `;
  }

  if (mode === 'isometric') {
    return `
      <polygon points="${polygonPoints(floorPoints)}" fill="rgba(15,23,42,0.7)" stroke="rgba(148,163,184,0.7)" stroke-width="2" />
      <polygon points="${polygonPoints(frontFace)}" fill="rgba(52,211,153,0.22)" stroke="rgba(52,211,153,0.95)" stroke-width="2" />
      <polygon points="${polygonPoints(sideFace)}" fill="rgba(148,163,184,0.22)" stroke="rgba(148,163,184,0.9)" stroke-width="2" />
      <polygon points="${polygonPoints(roofFace)}" fill="rgba(125,211,252,0.18)" stroke="rgba(125,211,252,0.9)" stroke-width="2" />
      ${topRooms}
      <text x="520" y="90" fill="#e5eefb" font-size="18" font-weight="700" text-anchor="middle">Isometric view</text>
    `;
  }

  return `
    <polygon points="${polygonPoints(floorPoints)}" fill="rgba(15,23,42,0.75)" stroke="rgba(148,163,184,0.7)" stroke-width="2" />
    ${topRooms}
    <text x="520" y="90" fill="#e5eefb" font-size="18" font-weight="700" text-anchor="middle">Top view</text>
  `;
}

function exportSvg() {
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svg);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'house-plan.svg';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function render() {
  const defs = `
    <defs>
      <pattern id="gridPattern" width="${state.snap}" height="${state.snap}" patternUnits="userSpaceOnUse">
        <path d="M ${state.snap} 0 L 0 0 0 ${state.snap}" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="1"/>
      </pattern>
    </defs>
  `;

  if (state.viewMode !== '2d') {
    svg.innerHTML = `
      ${defs}
      <rect width="1100" height="750" fill="#0f172a"></rect>
      <rect width="1100" height="750" fill="url(#gridPattern)"></rect>
      ${create3DFloorMarkup(state.viewMode)}
    `;
    return;
  }

  const wallMarkup = state.walls
    .map(
      (wall, index) => `
        <line
          data-kind="wall"
          data-id="${index}"
          class="wall"
          x1="${wall.x1}"
          y1="${wall.y1}"
          x2="${wall.x2}"
          y2="${wall.y2}"
        ></line>
      `,
    )
    .join('');

  const roomMarkup = state.rooms
    .map(
      (room, index) => `
        <g data-kind="room" data-id="${index}">
          <rect
            class="room"
            x="${room.x}"
            y="${room.y}"
            width="${room.width}"
            height="${room.height}"
            rx="8"
          ></rect>
          <text class="room-label" x="${room.x + room.width / 2}" y="${room.y + room.height / 2}">${room.name}</text>
        </g>
      `,
    )
    .join('');

  const labelMarkup = state.labels
    .map(
      (label, index) => `
        <text data-kind="label" data-id="${index}" class="plan-label" x="${label.x}" y="${label.y}">${label.text}</text>
      `,
    )
    .join('');

  const dimensionMarkup = createDimensionMarkup();
  const setbackMarkup = createSetbackMarkup();
  const openingMarkup = createOpeningMarkup();

  let draftMarkup = '';

  if (state.draft && state.draft.kind === 'wall') {
    draftMarkup = `
      <line
        class="preview-wall"
        x1="${state.draft.x1}"
        y1="${state.draft.y1}"
        x2="${state.draft.x2}"
        y2="${state.draft.y2}"
      ></line>
    `;
  }

  if (state.draft && state.draft.kind === 'room') {
    const preview = normalizeRoomRect(state.draft);
    draftMarkup = `
      <rect
        class="preview-room"
        x="${preview.x}"
        y="${preview.y}"
        width="${preview.width}"
        height="${preview.height}"
      ></rect>
    `;
  }

  svg.innerHTML = `
    ${defs}
    <rect width="1100" height="750" fill="#0f172a"></rect>
    <rect width="1100" height="750" fill="url(#gridPattern)"></rect>
    ${setbackMarkup}
    ${roomMarkup}
    ${wallMarkup}
    ${labelMarkup}
    ${openingMarkup}
    ${dimensionMarkup}
    ${draftMarkup}
  `;
}

svg.addEventListener('pointerdown', (event) => {
  if (state.viewMode !== '2d') {
    return;
  }

  const point = getSvgPoint(event);
  const snapped = { x: snap(point.x), y: snap(point.y) };

  if (state.tool === 'wall') {
    state.draft = {
      kind: 'wall',
      x1: snapped.x,
      y1: snapped.y,
      x2: snapped.x,
      y2: snapped.y,
    };
    render();
    return;
  }

  if (state.tool === 'room') {
    state.draft = {
      kind: 'room',
      x: snapped.x,
      y: snapped.y,
      w: 0,
      h: 0,
    };
    render();
    return;
  }

  if (state.tool === 'label') {
    const text = window.prompt('Enter a label for this point:', `Area ${state.labels.length + 1}`);
    if (text && text.trim()) {
      addLabel(snapped.x, snapped.y, text.trim());
      render();
    }
    return;
  }

  if (state.tool === 'erase') {
    const target = event.target.closest('[data-kind]');
    if (!target) return;

    const kind = target.dataset.kind;
    const index = Number(target.dataset.id);

    if (kind === 'wall') {
      state.walls.splice(index, 1);
    }

    if (kind === 'room') {
      state.rooms.splice(index, 1);
    }

    if (kind === 'label') {
      state.labels.splice(index, 1);
    }

    render();
  }
});

svg.addEventListener('pointermove', (event) => {
  if (state.viewMode !== '2d' || !state.draft || state.tool === 'erase' || state.tool === 'label') {
    return;
  }

  const point = getSvgPoint(event);
  const snapped = { x: snap(point.x), y: snap(point.y) };

  if (state.draft.kind === 'wall') {
    state.draft.x2 = snapped.x;
    state.draft.y2 = snapped.y;
  }

  if (state.draft.kind === 'room') {
    state.draft.w = snapped.x - state.draft.x;
    state.draft.h = snapped.y - state.draft.y;
  }

  render();
});

svg.addEventListener('pointerup', () => {
  if (state.viewMode !== '2d' || !state.draft) {
    return;
  }

  if (state.draft.kind === 'wall') {
    const dx = state.draft.x2 - state.draft.x1;
    const dy = state.draft.y2 - state.draft.y1;
    const length = Math.hypot(dx, dy);

    if (length > 8) {
      addWall(state.draft.x1, state.draft.y1, state.draft.x2, state.draft.y2);
    }
  }

  if (state.draft.kind === 'room') {
    const rect = normalizeRoomRect(state.draft);
    if (rect.width > 25 && rect.height > 25) {
      addRoom(rect);
      addArchitecturalAnnotations();
    }
  }

  state.draft = null;
  render();
});

snapSlider.addEventListener('input', (event) => {
  state.snap = Number(event.target.value);
  snapValue.textContent = `${state.snap} px`;
  render();
});

clearCanvasButton.addEventListener('click', () => {
  state.walls = [];
  state.rooms = [];
  state.labels = [];
  state.dimensions = [];
  state.openings = [];
  state.setbacks = [];
  state.draft = null;
  render();
});

exportButton.addEventListener('click', exportSvg);
generatePlanButton.addEventListener('click', generateSmartPlan);

document.querySelectorAll('.tool-button').forEach((button) => {
  button.addEventListener('click', () => setTool(button.dataset.tool));
});

document.querySelectorAll('.view-btn').forEach((button) => {
  button.addEventListener('click', () => setViewMode(button.dataset.view));
});

[groundAreaInput, bedroomCountInput, bathroomCountInput].forEach((input) => {
  input.addEventListener('input', renderMaterialEstimate);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    state.draft = null;
    render();
  }
});

render();
renderMaterialEstimate();
generateSmartPlan();
