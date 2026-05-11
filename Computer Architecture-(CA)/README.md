# Cache Memory Simulator — ELE336 Computer Architecture

An **interactive cache memory visualization and simulation system** built as a semester project for ELE336 Computer Architecture. This tool demonstrates CPU memory accesses, cache behavior, hits/misses, data movement between memory hierarchy levels, cache replacement policies, and real-time performance metrics.

## Features

### Cache Organizations
- **Direct-Mapped Cache**: Each memory block maps to exactly one cache line
- **Fully Associative Cache**: Any block can be placed in any cache line
- **Set-Associative Cache**: Configurable N-way (2-way, 4-way, etc.)

### Replacement Policies
- **LRU (Least Recently Used)**: Evicts the least recently accessed block
- **FIFO (First-In First-Out)**: Evicts the oldest loaded block
- Dynamic switching between policies at runtime

### Simulation Features
- Manual address input (decimal, hex `0x`, binary `0b`)
- Sample address sequences (temporal, spatial, thrashing patterns)
- Random address generation with locality patterns
- File import support (`.txt`, `.csv`)
- Step-by-step simulation with pause/play controls
- Adjustable simulation speed

### Visualization
- CPU → Cache → Memory data flow diagram
- Address decomposition (Tag | Index | Offset) with color coding
- Cache grid showing all sets and ways in real-time
- Hit (green) / Miss (red) visual highlighting with glow animations
- Animated data flow particles between components
- Access timeline bar chart with hit ratio trend line

### Performance Metrics (Live)
- Cache Hits / Misses counts
- Hit Ratio / Miss Ratio with progress bars
- AMAT (Average Memory Access Time)
- Total access count
- Animated counter transitions

### Educational Features
- Step-by-step explanation panel with reasoning for each access
- Tooltips on all configuration parameters
- Color-coded binary address breakdown
- "Why was this a miss?" and "Which block was replaced?" explanations
- Scenario presets demonstrating temporal locality, spatial locality, and thrashing

### Advanced Features
- Configurable: cache size, block size, associativity, hit time, miss penalty
- Configuration presets (Small/Medium/Large)
- Export simulation results as CSV
- Keyboard shortcuts (←/→ for stepping, Space for play/pause)
- Dark mode glassmorphism UI
- Fully responsive design

## Installation

No installation required! This is a pure HTML/CSS/JavaScript application.

1. Clone or download the project folder
2. Open `index.html` in any modern web browser (Chrome, Firefox, Edge)

```
CA2/
├── index.html      # Main application page
├── style.css       # Styles and animations
├── simulator.js    # Cache simulation engine (core logic)
├── app.js          # UI controller and visualization
├── README.md       # This file
└── docs/
    └── oral_exam_prep.md  # Oral exam preparation guide
```

## Usage

1. **Configure** the cache parameters (type, size, block size, associativity, policy)
2. **Enter addresses** manually, use sample/random generators, or load from file
3. **Run Simulation** to process all addresses
4. **Step through** results using ←/→ buttons or auto-play
5. **Observe** the data flow visualization, cache state, and metrics
6. **Export** results as CSV for further analysis

## Architecture

### Simulation Engine (`simulator.js`)
- `CacheSimulator` class — core OOP-based simulation
- Address decomposition: `TAG | INDEX | OFFSET` from 32-bit addresses
- Replacement policy implementations (LRU timestamps, FIFO load order)
- Complete history and snapshot system for step-by-step replay
- Helper functions: `parseAddresses()`, `validateConfig()`, `exportToCSV()`

### UI Controller (`app.js`)
- Event-driven architecture separating UI from simulation logic
- Canvas-based timeline chart rendering
- DOM-based cache grid visualization with CSS animations
- Step navigation system with auto-play interval control

### Key Formulas
- **AMAT** = Hit Time + Miss Rate × Miss Penalty
- **Hit Rate** = Hits / Total Accesses
- **Number of Sets** = Total Lines / Associativity
- **Address Bits**: Offset = log₂(Block Size), Index = log₂(Sets), Tag = 32 - Offset - Index

## Technology Stack

- **HTML5** — Semantic structure
- **CSS3** — Glassmorphism, animations, responsive design
- **Vanilla JavaScript** — No frameworks, no build tools
- **Google Fonts** — Inter + JetBrains Mono
- **Canvas API** — Timeline chart

Chosen for simplicity, portability, and zero-dependency deployment.

## License

ELE336 Computer Architecture — Semester Project © 2026
