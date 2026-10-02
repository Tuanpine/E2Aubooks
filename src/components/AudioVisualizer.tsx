import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isPlaying: boolean;
  barColor?: string;
  barCount?: number;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isPlaying,
  barColor = '#10b981',
  barCount = 28,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = (width / barCount) * 0.65;
      const gap = (width - barWidth * barCount) / (barCount - 1);

      phase += 0.08;

      for (let i = 0; i < barCount; i++) {
        let barHeight = 4; // idle height

        if (isPlaying) {
          // Dynamic harmonic wave simulation synced to speech rhythm
          const wave1 = Math.sin(phase + i * 0.35);
          const wave2 = Math.cos(phase * 1.4 + i * 0.2);
          const wave3 = Math.sin(phase * 0.7 - i * 0.15);
          const factor = Math.abs(wave1 * 0.5 + wave2 * 0.35 + wave3 * 0.25);
          barHeight = Math.max(4, factor * (height - 6));
        }

        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        // Gradient
        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        grad.addColorStop(0, '#06b6d4'); // cyan
        grad.addColorStop(0.5, barColor); // emerald
        grad.addColorStop(1, '#6366f1'); // indigo

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, barColor, barCount]);

  return (
    <canvas
      ref={canvasRef}
      width={180}
      height={32}
      className="w-full max-w-[200px] h-8 rounded-lg bg-slate-900/60 border border-slate-800/80 px-1"
    />
  );
};
