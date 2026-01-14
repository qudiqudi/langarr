import React from 'react';

interface ProfileBadgeProps {
    type: 'original' | 'dub';
    label: string;
    className?: string;
    size?: 'sm' | 'xs';
}

export default function ProfileBadge({ type, label, className = '', size = 'sm' }: ProfileBadgeProps) {
    const baseClasses = "inline-flex items-center rounded font-medium border";

    const sizeClasses = size === 'xs'
        ? "px-1.5 py-0 text-[10px]"
        : "px-2 py-0.5 text-xs";

    // Revised colors: 
    // Original: Cyan (Cool, clean)
    // Dub: Rose (Warm, distinct)
    const colorClasses = type === 'original'
        ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
        : "bg-rose-500/10 text-rose-400 border-rose-500/20";

    return (
        <span className={`${baseClasses} ${sizeClasses} ${colorClasses} ${className}`}>
            {label}
        </span>
    );
}
