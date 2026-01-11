import React from 'react';

interface ProfileBadgeProps {
    type: 'original' | 'dub';
    label: string;
    className?: string;
}

export default function ProfileBadge({ type, label, className = '' }: ProfileBadgeProps) {
    const baseClasses = "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border";

    // Revised colors: 
    // Original: Cyan (Cool, clean)
    // Dub: Rose (Warm, distinct)
    const colorClasses = type === 'original'
        ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
        : "bg-rose-500/10 text-rose-400 border-rose-500/20";

    return (
        <span className={`${baseClasses} ${colorClasses} ${className}`}>
            {label}
        </span>
    );
}
