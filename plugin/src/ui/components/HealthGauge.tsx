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
  const size = 240;
  const strokeWidth = 24;
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
      <div className="relative" style={{ width: size, height: size / 2 + 20 }}>
        <svg
          width={size}
          height={size / 2 + 20}
          viewBox={`0 0 ${size} ${size / 2 + 20}`}
          className="overflow-visible"
        >
          <defs>
            {/* Background gradient (subtle gray) */}
            <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#e8eaed" />
              <stop offset="50%" stopColor="#e0e4e8" />
              <stop offset="100%" stopColor="#e8e6ed" />
            </linearGradient>

            {/* Progress gradient (green -> teal -> blue -> purple -> orange) */}
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6b9b7a" />
              <stop offset="30%" stopColor="#7fb8a8" />
              <stop offset="50%" stopColor="#8badd4" />
              <stop offset="70%" stopColor="#9a9bd4" />
              <stop offset="100%" stopColor="#c9a86c" />
            </linearGradient>

            {/* Inner shadow for depth */}
            <filter id="innerShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
              <feOffset in="blur" dx="0" dy="2" result="offsetBlur" />
              <feComposite in="SourceGraphic" in2="offsetBlur" operator="over" />
            </filter>

            {/* Glow for the marker */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
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
            r={14}
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
            r={8}
            fill="#4a4a8a"
            style={{
              opacity: animatedProgress > 0 ? 1 : 0,
              transition: "opacity 0.3s",
            }}
          />
        </svg>

        {/* Center text */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-end pb-2"
          style={{ paddingBottom: 8 }}
        >
          <span
            className="text-4xl font-bold"
            style={{ color: "#3a3a7a" }}
          >
            {displayHealth}%
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: "#5a5a8a" }}
          >
            Edge cases covered
          </span>
        </div>
      </div>
    </div>
  );
}
