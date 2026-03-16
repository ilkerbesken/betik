/**
 * WebGPURenderer — GPU-accelerated drawing layer
 */
class WebGPURenderer {
    constructor() {
        this._ready = false;
        this._supported = false;
        this._initPromise = this._init();
    }

    async _init() {
        if (!navigator.gpu) {
            console.info('[WebGPU] Browser does not support WebGPU. Falling back to Canvas2D.');
            this._supported = false;
            return;
        }

        try {
            this._adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
            if (!this._adapter) { this._supported = false; return; }

            this._device = await this._adapter.requestDevice();
            this._device.lost.then((info) => {
                console.warn('[WebGPU] Device lost:', info.message);
                this._ready = false;
                this._supported = false;
            });

            this._format = navigator.gpu.getPreferredCanvasFormat();
            this._gpuCanvas = new OffscreenCanvas(2048, 2048);
            this._context = this._gpuCanvas.getContext('webgpu');
            this._context.configure({
                device: this._device,
                format: this._format,
                alphaMode: 'premultiplied'
            });

            // Build Pipelines
            this._strokePipeline = await this._buildStrokePipeline();
            this._charcoalPipeline = await this._buildCharcoalPipeline();
            this._fountainPenPipeline = await this._buildFountainPenPipeline();

            this._ready = true;
            this._supported = true;
            console.info('[WebGPU] ✅ Initialized successfully.');
        } catch (err) {
            console.warn('[WebGPU] Init error:', err);
            this._supported = false;
        }
    }

    async waitReady() { await this._initPromise; return this._ready; }
    get isSupported() { return this._supported; }

    // ── Shaders ─────────────────────────────────────────────────

    _strokeShaderSrc() {
        return `
struct Uniforms {
    transform: mat4x4<f32>,
    color: vec4<f32>,
    opacity: f32,
    _pad: vec3<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexIn {
    @location(0) position: vec2<f32>,
    @location(1) side: f32,
    @location(2) radius: f32,
};

struct VertexOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(v: VertexIn) -> VertexOut {
    let worldPos = vec4<f32>(v.position, 0.0, 1.0);
    var out: VertexOut;
    out.clip  = u.transform * worldPos;
    out.color = u.color * vec4<f32>(1.0, 1.0, 1.0, u.opacity);
    return out;
}

@fragment
fn fs_main(v: VertexOut) -> @location(0) vec4<f32> {
    return v.color;
}
        `;
    }

    _fountainPenShaderSrc() {
        return `
struct Uniforms {
    transform: mat4x4<f32>,
    color: vec4<f32>,
    opacity: f32,
    nibAngle: f32,
    minWidthRatio: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexIn {
    @location(0) position: vec2<f32>,
    @location(1) side: f32,
    @location(2) pressure: f32,
};

struct VertexOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(v: VertexIn) -> VertexOut {
    // Offset perpendicular to nibAngle
    let nx = -sin(u.nibAngle);
    let ny = cos(u.nibAngle);
    
    // Width isn't variable in vertex shader based on direction here (complexity)
    // but the NIB itself is a line segment. So we just offset along nx, ny.
    // The visual "variable width" comes from moving parallel vs perpendicular to that segment.
    
    // Offset perpendicular to nibAngle
    let nx = -sin(u.nibAngle);
    let ny = cos(u.nibAngle);
    
    // Smooth thickness transition using pressure
    let radius = v.pressure; 
    let offset = vec2<f32>(nx, ny) * radius * v.side;
    
    let worldPos = vec4<f32>(v.position + offset, 0.0, 1.0);
    var out: VertexOut;
    out.clip = u.transform * worldPos;
    
    // Add a small amount of brightness to edges if using a specific blend, 
    // but here we just pass pure color.
    out.color = u.color * vec4<f32>(1.0, 1.0, 1.0, u.opacity);
    return out;
}

@fragment
fn fs_main(v: VertexOut) -> @location(0) vec4<f32> {
    // For even smoother edges, we could use fwidth() or distance to edge,
    // but a solid return is fine if vertex density is high.
    return v.color;
}
        `;
    }

    // ── Pipeline Builders ───────────────────────────────────────

    async _buildStrokePipeline() {
        const shaderModule = this._device.createShaderModule({ code: this._strokeShaderSrc() });
        const layout = this._device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }]
        });
        const pipeline = await this._device.createRenderPipelineAsync({
            layout: this._device.createPipelineLayout({ bindGroupLayouts: [layout] }),
            vertex: {
                module: shaderModule, entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 16,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' },
                        { shaderLocation: 1, offset: 8, format: 'float32' },
                        { shaderLocation: 2, offset: 12, format: 'float32' }
                    ]
                }]
            },
            fragment: {
                module: shaderModule, entryPoint: 'fs_main',
                targets: [{
                    format: this._format,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' }
                    }
                }]
            },
            primitive: { topology: 'triangle-strip' }
        });
        return { pipeline, layout };
    }

    async _buildFountainPenPipeline() {
        const mod = this._device.createShaderModule({ code: this._fountainPenShaderSrc() });
        const layout = this._device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }]
        });
        const pipeline = await this._device.createRenderPipelineAsync({
            layout: this._device.createPipelineLayout({ bindGroupLayouts: [layout] }),
            vertex: {
                module: mod, entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 16,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' },
                        { shaderLocation: 1, offset: 8, format: 'float32' },
                        { shaderLocation: 2, offset: 12, format: 'float32' }
                    ]
                }]
            },
            fragment: {
                module: mod, entryPoint: 'fs_main',
                targets: [{
                    format: this._format,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' }
                    }
                }]
            },
            primitive: { topology: 'triangle-strip' }
        });
        return { pipeline, layout };
    }

    async _buildCharcoalPipeline() {
        const code = `
struct Uniforms {
    transform: mat4x4<f32>,
    color: vec4<f32>,
    opacity: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexIn {
    @location(0) pos: vec2<f32>,
    @location(1) r: f32,
    @location(2) a: f32,
    @location(3) seed: f32,
    @builtin(vertex_index) vid: u32,
};

struct VertexOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) alpha: f32,
    @location(2) seed: f32,
};

@vertex
fn vs_main(v: VertexIn) -> VertexOut {
    var offsets = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0),
        vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, 1.0)
    );
    let off = offsets[v.vid];
    var out: VertexOut;
    out.clip = u.transform * vec4<f32>(v.pos + off * v.r, 0.0, 1.0);
    out.uv = off;
    out.alpha = v.a;
    out.seed = v.seed;
    return out;
}

fn hash(p: f32) -> f32 { return fract(sin(p) * 12345.6789); }

@fragment
fn fs_main(v: VertexOut) -> @location(0) vec4<f32> {
    let d = length(v.uv);
    if (d > 1.0) { discard; }
    let n = hash(v.seed + floor(v.uv.x * 150.0) + floor(v.uv.y * 150.0) * 1.7);
    var alpha = v.alpha * n;
    if (d > 0.8) { alpha *= (1.0 - d) * 5.0; }
    return vec4<f32>(u.color.rgb, alpha * u.opacity);
}
        `;
        const mod = this._device.createShaderModule({ code });
        const layout = this._device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }]
        });
        const pipeline = await this._device.createRenderPipelineAsync({
            layout: this._device.createPipelineLayout({ bindGroupLayouts: [layout] }),
            vertex: {
                module: mod, entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 20, stepMode: 'instance',
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' },
                        { shaderLocation: 1, offset: 8, format: 'float32' },
                        { shaderLocation: 2, offset: 12, format: 'float32' },
                        { shaderLocation: 3, offset: 16, format: 'float32' }
                    ]
                }]
            },
            fragment: {
                module: mod, entryPoint: 'fs_main',
                targets: [{
                    format: this._format,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' }
                    }
                }]
            },
            primitive: { topology: 'triangle-strip' }
        });
        return { pipeline, layout };
    }

    // ── Utils ───────────────────────────────────────────────────

    _createUniformBuffer(transform, color, opacity, extras = null) {
        // Standard size 96 bytes (24 floats)
        const data = new Float32Array(24);
        data.set(transform, 0);
        data[16] = color[0]; data[17] = color[1]; data[18] = color[2]; data[19] = color[3];
        data[20] = opacity;
        if (extras) {
            for (let i = 0; i < extras.length; i++) {
                data[21 + i] = extras[i];
            }
        }
        const buf = this._device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
        new Float32Array(buf.getMappedRange()).set(data);
        buf.unmap();
        return buf;
    }

    _buildWorldToClip(w, h, zoom, pan) {
        const sx = 2 * zoom / w;
        const sy = -2 * zoom / h;
        const tx = 2 * (pan ? pan.x : 0) / w - 1;
        const ty = 1 - 2 * (pan ? pan.y : 0) / h;
        return new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, tx, ty, 0, 1]);
    }

    _buildStrokeVertices(points, strokeWidth) {
        const len = points.length;
        if (len < 2) return null;
        const verts = new Float32Array(len * 2 * 4);
        let idx = 0;
        const look = Math.max(2, Math.floor(strokeWidth * 0.5));
        for (let i = 0; i < len; i++) {
            const p = points[i];
            let dx = 0, dy = 0;
            const s = Math.max(0, i - look), e = Math.min(len - 1, i + look);
            for (let j = s; j < e; j++) { dx += points[j+1].x - points[j].x; dy += points[j+1].y - points[j].y; }
            if (dx === 0 && dy === 0) {
                if (i < len - 1) { dx = points[i+1].x - p.x; dy = points[i+1].y - p.y; }
                else if (i > 0) { dx = p.x - points[i-1].x; dy = p.y - points[i-1].y; }
            }
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / d, ny = dx / d;
            const r = (strokeWidth * 0.5) * (0.3 + (p.pressure || 0.5) * 1.4);
            verts[idx++] = p.x - nx * r; verts[idx++] = p.y - ny * r; verts[idx++] = -1; verts[idx++] = r;
            verts[idx++] = p.x + nx * r; verts[idx++] = p.y + ny * r; verts[idx++] = 1; verts[idx++] = r;
        }
        return verts;
    }

    _uploadBuffer(data, usage = GPUBufferUsage.VERTEX) {
        const buf = this._device.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
        new Float32Array(buf.getMappedRange()).set(data);
        buf.unmap();
        return buf;
    }

    _hexToRgb(hex) {
        if (!hex || hex === 'rainbow') return [0, 0, 0, 1];
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const n = parseInt(hex, 16);
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1.0];
    }

    // ── Drawing ─────────────────────────────────────────────────

    drawStroke(targetCtx, obj, zoom, viewWidth, viewHeight, pan) {
        if (!this._ready || !this._supported) return false;
        try {
            const w = Math.ceil(viewWidth), h = Math.ceil(viewHeight);
            if (this._gpuCanvas.width !== w || this._gpuCanvas.height !== h) {
                this._gpuCanvas.width = w; this._gpuCanvas.height = h;
                this._context.configure({ device: this._device, format: this._format, alphaMode: 'premultiplied' });
            }
            const vData = this._buildStrokeVertices(obj.points, obj.width || 3);
            if (!vData) return false;
            const vBuf = this._uploadBuffer(vData);
            const ortho = this._buildWorldToClip(w, h, zoom, pan);
            const rgba = this._hexToRgb(obj.color);
            const uBuf = this._createUniformBuffer(ortho, rgba, obj.opacity || 1.0);
            const bg = this._device.createBindGroup({ layout: this._strokePipeline.layout, entries: [{ binding: 0, resource: { buffer: uBuf } }] });
            const encoder = this._device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
                colorAttachments: [{ view: this._context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' }]
            });
            pass.setPipeline(this._strokePipeline.pipeline);
            pass.setBindGroup(0, bg);
            pass.setVertexBuffer(0, vBuf);
            pass.draw(vData.length / 4);
            pass.end();
            this._device.queue.submit([encoder.finish()]);
            targetCtx.save();
            if (obj.isHighlighter) targetCtx.globalCompositeOperation = 'multiply';
            targetCtx.drawImage(this._gpuCanvas, 0, 0, w, h);
            targetCtx.restore();
            vBuf.destroy(); uBuf.destroy();
            return true;
        } catch (e) { console.error('[WebGPU] drawStroke error:', e); return false; }
    }

    drawFountainPen(targetCtx, obj, zoom, viewWidth, viewHeight, pan) {
        if (!this._ready || !this._supported) return false;
        try {
            const w = Math.ceil(viewWidth), h = Math.ceil(viewHeight);
            if (this._gpuCanvas.width !== w || this._gpuCanvas.height !== h) {
                this._gpuCanvas.width = w; this._gpuCanvas.height = h;
                this._context.configure({ device: this._device, format: this._format, alphaMode: 'premultiplied' });
            }
            // Use same vertex structure as stroke but reuse pressure for half-width
            const pts = obj.points;
            const baseW = obj.width || 5;
            const vData = new Float32Array(pts.length * 2 * 4);
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                const halfW = (baseW / 2) * (p.pressure || 0.5) * 2;
                const idx = i * 8;
                vData[idx] = p.x; vData[idx+1] = p.y; vData[idx+2] = -1; vData[idx+3] = halfW;
                vData[idx+4] = p.x; vData[idx+5] = p.y; vData[idx+6] = 1; vData[idx+7] = halfW;
            }
            const vBuf = this._uploadBuffer(vData);
            const ortho = this._buildWorldToClip(w, h, zoom, pan);
            const rgba = this._hexToRgb(obj.color);
            const uBuf = this._createUniformBuffer(ortho, rgba, obj.opacity || 1.0, [obj.nibAngle || 0.785, obj.minWidthRatio || 0.2]);
            const bg = this._device.createBindGroup({ layout: this._fountainPenPipeline.layout, entries: [{ binding: 0, resource: { buffer: uBuf } }] });
            const encoder = this._device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
                colorAttachments: [{ view: this._context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' }]
            });
            pass.setPipeline(this._fountainPenPipeline.pipeline);
            pass.setBindGroup(0, bg);
            pass.setVertexBuffer(0, vBuf);
            pass.draw(vData.length / 4);
            pass.end();
            this._device.queue.submit([encoder.finish()]);
            targetCtx.drawImage(this._gpuCanvas, 0, 0, w, h);
            vBuf.destroy(); uBuf.destroy();
            return true;
        } catch (e) { console.error('[WebGPU] drawFountainPen error:', e); return false; }
    }

    drawCharcoal(targetCtx, obj, zoom, viewWidth, viewHeight, pan) {
        if (!this._ready || !this._supported) return false;
        try {
            const w = Math.ceil(viewWidth), h = Math.ceil(viewHeight);
            if (this._gpuCanvas.width !== w || this._gpuCanvas.height !== h) {
                this._gpuCanvas.width = w; this._gpuCanvas.height = h;
                this._context.configure({ device: this._device, format: this._format, alphaMode: 'premultiplied' });
            }
            const pts = obj.points;
            const bw = obj.width || 8, bo = obj.opacity || 0.9;
            const dabs = [];
            let seed = 12345;
            const frand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
            for (let i = 0; i < pts.length - 1; i++) {
                const p1 = pts[i], p2 = pts[i+1];
                const d = Math.sqrt((p2.x-p1.x)**2 + (p2.y-p1.y)**2);
                const steps = Math.max(1, Math.ceil(d / 1.5));
                for (let s = 0; s < steps; s++) {
                    const t = s / steps;
                    const x = p1.x + (p2.x - p1.x) * t, y = p1.y + (p2.y - p1.y) * t;
                    const pr = (p1.pressure || 0.5) + ((p2.pressure || 0.5) - (p1.pressure || 0.5)) * t;
                    const r = (bw/2) * (0.5 + pr * 1.2);
                    const dabCount = Math.ceil(r / 2) + 1;
                    for (let j = 0; j < dabCount; j++) {
                        dabs.push(
                            x + (frand() - 0.5) * r * 1.2, 
                            y + (frand() - 0.5) * r * 1.2, 
                            frand() * 0.8 + 0.2, 
                            bo * pr * (frand() * 0.3 + 0.1), 
                            frand() * 1000
                        );
                    }
                }
            }
            if (!dabs.length) return false;
            const dabData = new Float32Array(dabs);
            const vBuf = this._uploadBuffer(dabData);
            const ortho = this._buildWorldToClip(w, h, zoom, pan);
            const uBuf = this._createUniformBuffer(ortho, this._hexToRgb(obj.color), 1.0);
            const bg = this._device.createBindGroup({ layout: this._charcoalPipeline.layout, entries: [{ binding: 0, resource: { buffer: uBuf } }] });
            const encoder = this._device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
                colorAttachments: [{ view: this._context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' }]
            });
            pass.setPipeline(this._charcoalPipeline.pipeline);
            pass.setBindGroup(0, bg);
            pass.setVertexBuffer(0, vBuf);
            pass.draw(4, dabData.length / 5);
            pass.end();
            this._device.queue.submit([encoder.finish()]);
            targetCtx.drawImage(this._gpuCanvas, 0, 0, w, h);
            vBuf.destroy(); uBuf.destroy();
            return true;
        } catch (e) { console.error('[WebGPU] drawCharcoal error:', e); return false; }
    }

    drawBatch(targetCtx, objects, zoom, viewWidth, viewHeight, pan) {
        if (!this._ready || !this._supported) return false;
        try {
            const w = Math.ceil(viewWidth), h = Math.ceil(viewHeight);
            if (this._gpuCanvas.width !== w || this._gpuCanvas.height !== h) {
                this._gpuCanvas.width = w; this._gpuCanvas.height = h;
                this._context.configure({ device: this._device, format: this._format, alphaMode: 'premultiplied' });
            }
            const allVerts = [], calls = [];
            let total = 0;
            for (const obj of objects) {
                if (obj.type === 'charcoal' || obj.type === 'fountain-pen') continue;
                const vd = this._buildStrokeVertices(obj.points, obj.width || 3);
                if (!vd) continue;
                calls.push({ offset: total, count: vd.length / 4, color: this._hexToRgb(obj.color), opacity: obj.opacity || 1.0, isHigh: !!obj.isHighlighter });
                allVerts.push(vd);
                total += vd.length / 4;
            }
            if (!total) return false;
            const merged = new Float32Array(total * 4);
            let off = 0;
            for (const v of allVerts) { merged.set(v, off); off += v.length; }
            const vBuf = this._uploadBuffer(merged);
            const ortho = this._buildWorldToClip(w, h, zoom, pan);
            const encoder = this._device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
                colorAttachments: [{ view: this._context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' }]
            });
            pass.setPipeline(this._strokePipeline.pipeline);
            pass.setVertexBuffer(0, vBuf);
            const uBufs = [];
            for (const c of calls) {
                const ub = this._createUniformBuffer(ortho, c.color, c.opacity);
                uBufs.push(ub);
                const bg = this._device.createBindGroup({ layout: this._strokePipeline.layout, entries: [{ binding: 0, resource: { buffer: ub } }] });
                pass.setBindGroup(0, bg);
                pass.draw(c.count, 1, c.offset, 0);
            }
            pass.end();
            this._device.queue.submit([encoder.finish()]);
            targetCtx.drawImage(this._gpuCanvas, 0, 0, w, h);
            vBuf.destroy(); uBufs.forEach(b => b.destroy());
            return true;
        } catch (e) { console.error('[WebGPU] drawBatch error:', e); return false; }
    }

    destroy() {
        if (this._device) { this._device.destroy(); this._device = null; }
        this._ready = false; this._supported = false;
    }
}
window.webGPURenderer = new WebGPURenderer();
