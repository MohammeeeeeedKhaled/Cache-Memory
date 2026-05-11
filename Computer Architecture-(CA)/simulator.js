/* ============================================================
   Cache Memory Simulator — Core Simulation Engine
   ELE336 Computer Architecture Semester Project
   ============================================================
   This engine handles all cache simulation logic completely
   separate from the UI. It supports:
     - Direct-Mapped Cache
     - Fully Associative Cache
     - N-Way Set-Associative Cache
   Replacement Policies:
     - LRU (Least Recently Used)
     - FIFO (First-In First-Out)
   ============================================================ */

/**
 * CacheSimulator — Main simulation class
 * 
 * Architecture Notes:
 *   - 32-bit address space assumed
 *   - Address decomposition: [TAG | INDEX | OFFSET]
 *   - Each cache line stores: valid bit, tag, data (block base address),
 *     load order (FIFO), and last-used timestamp (LRU)
 *   - Complete history and cache snapshots are stored for step-by-step replay
 */
class CacheSimulator {
    /**
     * @param {Object} config
     * @param {number} config.cacheSize   - Total cache size in bytes
     * @param {number} config.blockSize   - Block (line) size in bytes
     * @param {string} config.cacheType   - 'direct' | 'fully' | 'set'
     * @param {number} config.ways        - Number of ways (associativity)
     * @param {string} config.policy      - 'lru' | 'fifo'
     * @param {number} config.hitTime     - Cache hit time in cycles
     * @param {number} config.missPenalty  - Miss penalty in cycles (main memory latency)
     */
    constructor(config) {
        this.cacheSize = config.cacheSize;
        this.blockSize = config.blockSize;
        this.cacheType = config.cacheType;
        this.policy = config.policy;
        this.hitTime = config.hitTime;
        this.missPenalty = config.missPenalty;

        // Derived parameters
        this.totalLines = Math.floor(this.cacheSize / this.blockSize);

        // Determine associativity and number of sets based on cache type
        if (this.cacheType === 'direct') {
            // Direct-mapped: 1 way, numSets = totalLines
            this.ways = 1;
            this.numSets = this.totalLines;
        } else if (this.cacheType === 'fully') {
            // Fully associative: all lines in 1 set
            this.ways = this.totalLines;
            this.numSets = 1;
        } else {
            // Set-associative: user-specified ways
            this.ways = config.ways;
            this.numSets = Math.floor(this.totalLines / this.ways);
        }

        // Address bit field calculations (32-bit address space)
        this.offsetBits = Math.log2(this.blockSize);
        this.indexBits = this.numSets > 1 ? Math.log2(this.numSets) : 0;
        this.tagBits = 32 - this.offsetBits - this.indexBits;

        // Initialize cache: 2D array [sets][ways]
        this.cache = [];
        for (let i = 0; i < this.numSets; i++) {
            const set = [];
            for (let j = 0; j < this.ways; j++) {
                set.push({
                    valid: false,
                    tag: null,
                    data: null,       // Block base address
                    loadOrder: 0,     // FIFO: order of insertion
                    lastUsed: 0       // LRU: timestamp of last access
                });
            }
            this.cache.push(set);
        }

        // Performance statistics
        this.hits = 0;
        this.misses = 0;
        this.accessCount = 0;
        this.globalCounter = 0;

        // Step-by-step history for replay
        this.history = [];
        this.snapshots = [];
    }

    /** Get cache configuration info */
    getInfo() {
        return {
            totalLines: this.totalLines,
            numSets: this.numSets,
            ways: this.ways,
            offsetBits: this.offsetBits,
            indexBits: this.indexBits,
            tagBits: this.tagBits,
            cacheType: this.cacheType,
            policy: this.policy
        };
    }

    /**
     * Decompose a 32-bit address into tag, index, and offset fields.
     * 
     * Address format: [TAG (tagBits) | INDEX (indexBits) | OFFSET (offsetBits)]
     * 
     * - Offset: selects the byte within a block (log2(blockSize) bits)
     * - Index: selects which set the block maps to (log2(numSets) bits)
     * - Tag: remaining upper bits used for identification
     * 
     * @param {number} address - 32-bit memory address
     * @returns {{tag: number, index: number, offset: number}}
     */
    decomposeAddress(address) {
        const offset = address & ((1 << this.offsetBits) - 1);
        const index = (address >> this.offsetBits) & ((1 << this.indexBits) - 1);
        const tag = address >>> (this.offsetBits + this.indexBits);
        return { tag, index, offset };
    }

    /**
     * Format address as colored binary string parts for visualization.
     * @param {number} address
     * @returns {{full: string, tagPart: string, indexPart: string, offsetPart: string}}
     */
    formatBinary(address) {
        const bin = (address >>> 0).toString(2).padStart(32, '0');
        return {
            full: bin,
            tagPart: bin.substring(0, this.tagBits),
            indexPart: bin.substring(this.tagBits, this.tagBits + this.indexBits),
            offsetPart: bin.substring(this.tagBits + this.indexBits)
        };
    }

    /** Deep clone the cache state for history snapshots */
    snapshotCache() {
        return this.cache.map(set =>
            set.map(line => ({ ...line }))
        );
    }

    /**
     * Access a single memory address through the cache.
     * 
     * Algorithm:
     * 1. Decompose address into tag, index, offset
     * 2. Use index to select the target set
     * 3. Search all ways in the set for a matching tag (valid && tag match)
     * 4. If found → HIT: update LRU timestamp
     * 5. If not found → MISS:
     *    a. Look for an empty (invalid) line in the set
     *    b. If no empty line, apply replacement policy (LRU or FIFO)
     *    c. Load the new block into the selected line
     * 
     * @param {number} address - Memory address to access
     * @returns {Object} Step record with all access details
     */
    access(address) {
        this.globalCounter++;
        this.accessCount++;

        const { tag, index, offset } = this.decomposeAddress(address);
        const setIndex = index;
        const set = this.cache[setIndex];

        let hit = false;
        let hitLineIndex = -1;
        let replacedLine = null;
        let replacedLineIndex = -1;
        let replacementReason = '';

        // Phase 1: Search for tag match in the selected set
        for (let i = 0; i < set.length; i++) {
            if (set[i].valid && set[i].tag === tag) {
                hit = true;
                hitLineIndex = i;
                break;
            }
        }

        if (hit) {
            // === CACHE HIT ===
            this.hits++;
            // Update LRU timestamp (FIFO loadOrder stays the same on hit)
            set[hitLineIndex].lastUsed = this.globalCounter;

            const step = this._buildStepRecord(address, tag, setIndex, offset, true, hitLineIndex, null, null,
                `HIT in Set ${setIndex}, Way ${hitLineIndex} — Tag 0x${tag.toString(16).toUpperCase()} matched.`);

            // Educational explanation
            step.explanation = this._generateHitExplanation(address, tag, setIndex, hitLineIndex);
            
            this.history.push(step);
            this.snapshots.push(this.snapshotCache());
            return step;

        } else {
            // === CACHE MISS ===
            this.misses++;

            let targetLineIndex = -1;

            // Phase 2a: Look for an empty (invalid) line
            for (let i = 0; i < set.length; i++) {
                if (!set[i].valid) {
                    targetLineIndex = i;
                    replacementReason = 'compulsory';
                    break;
                }
            }

            // Phase 2b: If all lines are valid, apply replacement policy
            if (targetLineIndex === -1) {
                if (this.policy === 'lru') {
                    // LRU: evict the line with the smallest lastUsed timestamp
                    let minUsed = Infinity;
                    for (let i = 0; i < set.length; i++) {
                        if (set[i].lastUsed < minUsed) {
                            minUsed = set[i].lastUsed;
                            targetLineIndex = i;
                        }
                    }
                    replacementReason = 'lru';
                } else {
                    // FIFO: evict the line that was loaded earliest
                    let minOrder = Infinity;
                    for (let i = 0; i < set.length; i++) {
                        if (set[i].loadOrder < minOrder) {
                            minOrder = set[i].loadOrder;
                            targetLineIndex = i;
                        }
                    }
                    replacementReason = 'fifo';
                }

                replacedLine = { ...set[targetLineIndex] };
                replacedLineIndex = targetLineIndex;
            }

            // Phase 3: Load the new block into the cache
            set[targetLineIndex].valid = true;
            set[targetLineIndex].tag = tag;
            set[targetLineIndex].data = Math.floor(address / this.blockSize) * this.blockSize;
            set[targetLineIndex].loadOrder = this.globalCounter;
            set[targetLineIndex].lastUsed = this.globalCounter;

            let detail = `MISS in Set ${setIndex}`;
            if (replacedLine) {
                detail += ` → Replaced Way ${targetLineIndex} (Tag 0x${replacedLine.tag.toString(16).toUpperCase()}) using ${this.policy.toUpperCase()}`;
            } else {
                detail += ` → Loaded into Way ${targetLineIndex} (empty slot — compulsory miss)`;
            }

            const step = this._buildStepRecord(address, tag, setIndex, offset, false, targetLineIndex, replacedLine, replacedLineIndex, detail);
            step.replacementReason = replacementReason;
            step.explanation = this._generateMissExplanation(address, tag, setIndex, targetLineIndex, replacedLine, replacementReason);

            this.history.push(step);
            this.snapshots.push(this.snapshotCache());
            return step;
        }
    }

    /** Build a standardized step record */
    _buildStepRecord(address, tag, setIndex, offset, isHit, lineIndex, replacedLine, replacedLineIndex, detail) {
        return {
            step: this.accessCount,
            address: address,
            addressHex: '0x' + (address >>> 0).toString(16).toUpperCase().padStart(8, '0'),
            binary: this.formatBinary(address),
            tag: tag,
            tagHex: '0x' + tag.toString(16).toUpperCase(),
            index: setIndex,
            offset: offset,
            hit: isHit,
            lineIndex: lineIndex,
            setIndex: setIndex,
            detail: detail,
            replacedTag: replacedLine ? '0x' + replacedLine.tag.toString(16).toUpperCase() : null,
            replacedLineIndex: replacedLineIndex,
            explanation: ''
        };
    }

    /** Generate educational explanation for cache hits */
    _generateHitExplanation(address, tag, setIndex, wayIndex) {
        const lines = [];
        lines.push(`📍 Address ${address} (0x${address.toString(16).toUpperCase()}) was accessed.`);
        
        if (this.cacheType === 'direct') {
            lines.push(`🔎 Direct-mapped: Address maps to Line ${setIndex} (using index bits).`);
        } else if (this.cacheType === 'fully') {
            lines.push(`🔎 Fully associative: All ${this.ways} cache lines were searched.`);
        } else {
            lines.push(`🔎 ${this.ways}-way set-associative: Set ${setIndex} was selected, then all ${this.ways} ways were searched.`);
        }
        
        lines.push(`✅ Tag 0x${tag.toString(16).toUpperCase()} was found in Way ${wayIndex} — CACHE HIT!`);
        lines.push(`⚡ Data returned in ${this.hitTime} cycle(s). No memory access needed.`);
        
        return lines.join('\n');
    }

    /** Generate educational explanation for cache misses */
    _generateMissExplanation(address, tag, setIndex, wayIndex, replacedLine, reason) {
        const lines = [];
        lines.push(`📍 Address ${address} (0x${address.toString(16).toUpperCase()}) was accessed.`);
        
        if (this.cacheType === 'direct') {
            lines.push(`🔎 Direct-mapped: Address maps to Line ${setIndex} (using index bits).`);
        } else if (this.cacheType === 'fully') {
            lines.push(`🔎 Fully associative: All ${this.ways} cache lines were searched.`);
        } else {
            lines.push(`🔎 ${this.ways}-way set-associative: Set ${setIndex} was selected, then all ${this.ways} ways were searched.`);
        }
        
        lines.push(`❌ Tag 0x${tag.toString(16).toUpperCase()} was NOT found — CACHE MISS!`);
        
        if (reason === 'compulsory') {
            lines.push(`📦 Way ${wayIndex} was empty → block loaded there (compulsory miss — first access to this block).`);
        } else if (reason === 'lru') {
            lines.push(`🔄 All ways occupied. LRU policy selected Way ${wayIndex} (Tag 0x${replacedLine.tag.toString(16).toUpperCase()}) — it was the least recently used.`);
        } else if (reason === 'fifo') {
            lines.push(`🔄 All ways occupied. FIFO policy selected Way ${wayIndex} (Tag 0x${replacedLine.tag.toString(16).toUpperCase()}) — it was loaded first.`);
        }
        
        const blockBase = Math.floor(address / this.blockSize) * this.blockSize;
        lines.push(`🔃 Block starting at address ${blockBase} (0x${blockBase.toString(16).toUpperCase()}) fetched from main memory in ${this.missPenalty} cycles.`);
        
        return lines.join('\n');
    }

    /**
     * Run simulation on a list of addresses
     * @param {number[]} addresses
     * @returns {Object} Complete simulation results
     */
    simulate(addresses) {
        // Save initial empty cache snapshot
        this.snapshots.push(this.snapshotCache());

        for (const addr of addresses) {
            this.access(addr);
        }

        return this.getResults();
    }

    /** Get complete simulation results and performance metrics */
    getResults() {
        const total = this.hits + this.misses;
        const hitRatio = total > 0 ? this.hits / total : 0;
        const missRatio = total > 0 ? this.misses / total : 0;
        
        // AMAT = Hit Time + Miss Rate × Miss Penalty
        const amat = this.hitTime + (missRatio * this.missPenalty);
        
        // Total execution cycles = (Hits × HitTime) + (Misses × (HitTime + MissPenalty))
        const totalCycles = (this.hits * this.hitTime) + (this.misses * (this.hitTime + this.missPenalty));

        return {
            hits: this.hits,
            misses: this.misses,
            total: total,
            hitRatio: hitRatio,
            missRatio: missRatio,
            amat: amat,
            totalCycles: totalCycles,
            history: this.history,
            snapshots: this.snapshots,
            cacheInfo: this.getInfo()
        };
    }
}

/* ============================================================
   Utility Functions
   ============================================================ */

/**
 * Parse address string into array of unsigned 32-bit integers.
 * Supports:
 *   - Decimal: 42, 128
 *   - Hexadecimal: 0xFF, 0x1A
 *   - Binary: 0b1010, 0b11001100
 * Delimiters: commas, spaces, semicolons, newlines
 * 
 * @param {string} input
 * @returns {number[]}
 */
function parseAddresses(input) {
    if (!input || !input.trim()) return [];

    const tokens = input.trim().split(/[\s,;\n\r]+/).filter(t => t.length > 0);
    const addresses = [];

    for (const token of tokens) {
        let val;
        const t = token.trim().toLowerCase();
        if (t.startsWith('0x')) {
            val = parseInt(t, 16);
        } else if (t.startsWith('0b')) {
            val = parseInt(t.substring(2), 2);
        } else {
            val = parseInt(t, 10);
        }

        if (isNaN(val) || val < 0) {
            throw new Error(`Invalid address: "${token}"`);
        }
        addresses.push(val >>> 0); // Ensure unsigned 32-bit
    }

    return addresses;
}

/**
 * Validate cache configuration.
 * All sizes must be powers of 2, and consistency checks are performed.
 * 
 * @param {Object} config
 * @returns {string[]} Array of error messages (empty = valid)
 */
function validateConfig(config) {
    const errors = [];

    if (config.cacheSize <= 0) errors.push('Cache size must be positive.');
    if (config.blockSize <= 0) errors.push('Block size must be positive.');
    if ((config.cacheSize & (config.cacheSize - 1)) !== 0) errors.push('Cache size must be a power of 2.');
    if ((config.blockSize & (config.blockSize - 1)) !== 0) errors.push('Block size must be a power of 2.');
    if (config.blockSize > config.cacheSize) errors.push('Block size cannot exceed cache size.');

    const totalLines = config.cacheSize / config.blockSize;
    if (totalLines < 1) errors.push('Cache must have at least 1 line.');

    if (config.cacheType === 'set') {
        if (config.ways <= 0) errors.push('Number of ways must be positive.');
        if ((config.ways & (config.ways - 1)) !== 0) errors.push('Number of ways must be a power of 2.');
        if (config.ways > totalLines) errors.push('Number of ways cannot exceed total cache lines.');
        if (totalLines % config.ways !== 0) errors.push('Total lines must be divisible by number of ways.');
    }

    return errors;
}

/**
 * Generate sample address sequences for common educational scenarios
 * @param {string} scenario - 'temporal' | 'spatial' | 'thrashing' | 'mixed'
 * @param {number} blockSize
 * @returns {{addresses: number[], description: string}}
 */
function generateScenarioAddresses(scenario, blockSize) {
    switch (scenario) {
        case 'temporal':
            // Temporal locality: repeatedly access the same addresses
            return {
                addresses: [0, 4, 8, 0, 4, 8, 0, 4, 8, 16, 0, 4, 8, 16],
                description: 'Temporal Locality — Same addresses accessed repeatedly, demonstrating cache hits on re-access.'
            };
        case 'spatial':
            // Spatial locality: access sequential addresses within blocks
            return {
                addresses: Array.from({length: 16}, (_, i) => i * Math.max(1, blockSize / 4)),
                description: 'Spatial Locality — Sequential addresses within nearby blocks, showing how blocks capture neighboring data.'
            };
        case 'thrashing':
            // Cache thrashing: cyclic pattern exceeding cache capacity
            return {
                addresses: [0, 64, 128, 192, 256, 0, 64, 128, 192, 256, 0, 64, 128, 192, 256],
                description: 'Cache Thrashing — Cyclic access pattern exceeding cache capacity, causing repeated evictions and 0% hit rate.'
            };
        case 'mixed':
        default:
            return {
                addresses: [0, 4, 8, 16, 32, 0, 4, 64, 128, 0, 16, 32, 4, 8, 64],
                description: 'Mixed Pattern — Combination of new accesses and revisits, showing both hits and misses.'
            };
    }
}

/**
 * Export simulation results to CSV format string
 * @param {Object} results
 * @returns {string}
 */
function exportToCSV(results) {
    let csv = 'Step,Address (Hex),Address (Dec),Tag (Hex),Index,Offset,Result,Detail\n';
    for (const step of results.history) {
        csv += `${step.step},${step.addressHex},${step.address},${step.tagHex},${step.index},${step.offset},${step.hit ? 'HIT' : 'MISS'},"${step.detail}"\n`;
    }
    csv += '\n--- Performance Summary ---\n';
    csv += `Total Accesses,${results.total}\n`;
    csv += `Hits,${results.hits}\n`;
    csv += `Misses,${results.misses}\n`;
    csv += `Hit Ratio,${(results.hitRatio * 100).toFixed(2)}%\n`;
    csv += `Miss Ratio,${(results.missRatio * 100).toFixed(2)}%\n`;
    csv += `AMAT,${results.amat.toFixed(2)} cycles\n`;
    csv += `Total Cycles,${results.totalCycles}\n`;
    csv += `\nCache Configuration\n`;
    csv += `Type,${results.cacheInfo.cacheType}\n`;
    csv += `Ways,${results.cacheInfo.ways}\n`;
    csv += `Sets,${results.cacheInfo.numSets}\n`;
    csv += `Tag Bits,${results.cacheInfo.tagBits}\n`;
    csv += `Index Bits,${results.cacheInfo.indexBits}\n`;
    csv += `Offset Bits,${results.cacheInfo.offsetBits}\n`;
    return csv;
}
