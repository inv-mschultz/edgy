import React, { useEffect, useState } from "react";

interface HealthGaugeProps {
  /** Health percentage from 0-100 */
  health: number;
  /** Whether to animate on mount */
  animate?: boolean;
}

export function HealthGauge({ health, animate = true }: HealthGaugeProps) {
  const [displayHealth, setDisplayHealth] = useState(animate ? 0 : health);
  const [animatedProgress, setAnimatedProgress] = useState(animate ? 0 : health);

  useEffect(() => {
    if (!animate) {
      setDisplayHealth(health);
      setAnimatedProgress(health);
      return;
    }

    // Animate the gauge and number
    const duration = 1500;
    const startTime = Date.now();
    const startValue = 0;

    const animateValue = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out cubic)
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentValue = startValue + (health - startValue) * eased;
      setDisplayHealth(Math.round(currentValue));
      setAnimatedProgress(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animateValue);
      }
    };

    requestAnimationFrame(animateValue);
  }, [health, animate]);

  // SVG parameters
  const size = 200;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  // Arc calculations (180 degrees = half circle, from left to right)
  const circumference = Math.PI * radius;
  const progressOffset = circumference - (animatedProgress / 100) * circumference;

  // Calculate marker position
  const angle = Math.PI - (animatedProgress / 100) * Math.PI; // Start from left (PI) to right (0)
  const markerX = center + radius * Math.cos(angle);
  const markerY = center - radius * Math.sin(angle);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size / 2 + 30 }}>
        <svg
          width={size}
          height={size / 2 + 30}
          viewBox={`0 0 ${size} ${size / 2 + 30}`}
          className="overflow-visible"
        >
          <defs>
            {/* Background gradient (light gray) */}
            <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#E5E7EB" />
              <stop offset="100%" stopColor="#E5E7EB" />
            </linearGradient>

            {/* Progress gradient (purple to pink) */}
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4A1A6B" />
              <stop offset="50%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#C084FC" />
            </linearGradient>

            {/* Glow for the marker */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background arc (gray track) */}
          <path
            d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${center}`}
            fill="none"
            stroke="url(#bgGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Progress arc */}
          <path
            d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${center}`}
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={progressOffset}
            style={{
              transition: animate ? "none" : "stroke-dashoffset 0.5s ease-out",
            }}
          />

          {/* Marker circle (outer glow) */}
          <circle
            cx={markerX}
            cy={markerY}
            r={12}
            fill="white"
            filter="url(#glow)"
            style={{
              opacity: animatedProgress > 0 ? 1 : 0,
              transition: "opacity 0.3s",
            }}
          />

          {/* Marker circle (inner dot) */}
          <circle
            cx={markerX}
            cy={markerY}
            r={6}
            fill="#4A1A6B"
            style={{
              opacity: animatedProgress > 0 ? 1 : 0,
              transition: "opacity 0.3s",
            }}
          />
        </svg>

        {/* Center text */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-end"
          style={{ paddingBottom: 12 }}
        >
          <span
            className="text-3xl font-bold"
            style={{ color: '#4A1A6B' }}
          >
            {displayHealth}<span className="text-xl">%</span>
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: '#6B7280' }}
          >
            Edge cases covered
          </span>
        </div>
      </div>
    </div>
  );
}
