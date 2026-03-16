class TimerTool {
    constructor(app) {
        this.app = app;
        this.container = null;
        this.timer = null;
        this.timeLeft = 25 * 60; // Default 25 minutes
        this.isRunning = false;
        this.isCollapsed = false;

        this.init();
    }

    init() {
        this.createUI();
        this.setupEventListeners();
    }

    createUI() {
        this.container = document.createElement('div');
        this.container.id = 'timerWidget';
        this.container.className = 'timer-widget floating-widget hidden';

        this.container.innerHTML = `
            <div class="timer-header">
                <span class="timer-title">Odaklanma</span>
                <div class="timer-controls-top">
                    <button class="timer-collapse-btn" title="Küçült/Büyüt">-</button>
                    <button class="timer-close-btn" title="Kapat">×</button>
                </div>
            </div>
            <div class="timer-content">
                <div class="timer-display-container">
                    <button class="timer-adj-btn up" title="Dakikayı Artır">+</button>
                    <div class="timer-display">25:00</div>
                    <button class="timer-adj-btn down" title="Dakikayı Azalt">-</button>
                </div>
                <div class="timer-presets">
                    <button data-time="25">25dk</button>
                    <button data-time="15">15dk</button>
                    <button data-time="5">5dk</button>
                </div>
                <div class="timer-actions">
                    <button class="btn-timer-start">Başlat</button>
                    <button class="btn-timer-reset">Sıfırla</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);
        this.updateDisplay();
        this.makeDraggable();
    }

    setupEventListeners() {
        const startBtn = this.container.querySelector('.btn-timer-start');
        const resetBtn = this.container.querySelector('.btn-timer-reset');
        const closeBtn = this.container.querySelector('.timer-close-btn');
        const collapseBtn = this.container.querySelector('.timer-collapse-btn');
        const presets = this.container.querySelectorAll('.timer-presets button');
        const adjUp = this.container.querySelector('.timer-adj-btn.up');
        const adjDown = this.container.querySelector('.timer-adj-btn.down');

        startBtn.onclick = () => this.toggleTimer();
        resetBtn.onclick = () => this.reset();
        closeBtn.onclick = () => this.hide();
        collapseBtn.onclick = () => this.toggleCollapse();

        adjUp.onclick = () => this.adjustTime(60);
        adjDown.onclick = () => this.adjustTime(-60);

        presets.forEach(btn => {
            btn.onclick = () => {
                const mins = parseInt(btn.dataset.time);
                this.setTime(mins * 60);
            };
        });
    }

    adjustTime(seconds) {
        if (this.isRunning) return; // Çalışırken değiştirmeyelim
        this.timeLeft += seconds;
        if (this.timeLeft < 0) this.timeLeft = 0;
        this.updateDisplay();
    }

    toggleTimer() {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.container.querySelector('.btn-timer-start').textContent = 'Durdur';
        this.container.querySelector('.btn-timer-start').classList.add('active');

        this.timer = setInterval(() => {
            this.timeLeft--;
            if (this.timeLeft <= 0) {
                this.timeLeft = 0;
                this.stop();
                this.playAlert();
            }
            this.updateDisplay();
        }, 1000);
    }

    stop() {
        this.isRunning = false;
        clearInterval(this.timer);
        this.container.querySelector('.btn-timer-start').textContent = 'Başlat';
        this.container.querySelector('.btn-timer-start').classList.remove('active');
    }

    reset() {
        this.stop();
        this.timeLeft = 25 * 60;
        this.updateDisplay();
    }

    setTime(seconds) {
        this.stop();
        this.timeLeft = seconds;
        this.updateDisplay();
    }

    updateDisplay() {
        const mins = Math.floor(this.timeLeft / 60);
        const secs = this.timeLeft % 60;
        const display = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        this.container.querySelector('.timer-display').textContent = display;
    }

    show() {
        this.container.classList.remove('hidden');
    }

    hide() {
        this.container.classList.add('hidden');
    }

    toggle() {
        if (this.container.classList.contains('hidden')) {
            this.show();
        } else {
            this.hide();
        }
    }

    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;
        this.container.classList.toggle('collapsed', this.isCollapsed);
    }

    playAlert() {
        // Web Audio API ile uyarı sesi oluştur (Telifsiz ve Unique)
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const ctx = new AudioContext();

                const playTone = (freq, start, duration) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();

                    osc.type = 'sine';
                    osc.frequency.value = freq;

                    // Yumuşak ses zarfı (Envelope)
                    gain.gain.setValueAtTime(0, ctx.currentTime + start);
                    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + duration);

                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    osc.start(ctx.currentTime + start);
                    osc.stop(ctx.currentTime + start + duration);
                };

                // Çift tonlu uyarı: Bip-Bip... Biiip
                playTone(880, 0, 0.15);       // Kısa 1
                playTone(880, 0.2, 0.15);     // Kısa 2
                playTone(1760, 0.45, 0.4);    // Uzun ve İnce (Dikkat çekici)
            }
        } catch (e) {
            console.warn('AudioPlay hatası:', e);
        }

        // Pomodoro bittiğinde bildirim
        // Sesin duyulması için alert'i biraz geciktiriyoruz
        setTimeout(() => {
            alert("Süre doldu!");
        }, 600);
    }

    makeDraggable() {
        const header = this.container.querySelector('.timer-header');
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        header.addEventListener('mousedown', dragMouseDown);
        header.addEventListener('touchstart', dragMouseDown, { passive: false });

        const self = this;

        function dragMouseDown(e) {
            if (e.type === 'touchstart') {
                // We need preventDefault for drag to work correctly on many mobile browsers
                // but we must not be passive.
                e.preventDefault();
            }
            const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
            pos3 = clientX;
            pos4 = clientY;

            document.addEventListener('mouseup', closeDragElement);
            document.addEventListener('touchend', closeDragElement, { passive: true });
            document.addEventListener('mousemove', elementDrag);
            document.addEventListener('touchmove', elementDrag, { passive: false });
        }

        function elementDrag(e) {
            if (e.cancelable) e.preventDefault();
            const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
            pos1 = pos3 - clientX;
            pos2 = pos4 - clientY;
            pos3 = clientX;
            pos4 = clientY;
            self.container.style.top = (self.container.offsetTop - pos2) + "px";
            self.container.style.left = (self.container.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.removeEventListener('mouseup', closeDragElement);
            document.removeEventListener('touchend', closeDragElement);
            document.removeEventListener('mousemove', elementDrag);
            document.removeEventListener('touchmove', elementDrag);
        }
    }
}
