export const DroneIcon = ({ className, style, size = 18 }) => (
    <svg 
        stroke="currentColor" 
        fill="none" 
        strokeWidth="2" 
        viewBox="0 0 24 24" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        height={size} 
        width={size} 
        className={className}
        style={style}
    >
        <path d="M12 2v4" />
        <path d="M12 18v4" />
        <path d="M2 12h4" />
        <path d="M18 12h4" />
        <path d="m15 15 3.5 3.5" />
        <path d="m9 9-3.5-3.5" />
        <path d="m15 9 3.5-3.5" />
        <path d="m9 15-3.5 3.5" />
        <circle cx="12" cy="12" r="3" />
        <circle cx="20" cy="5" r="2" />
        <circle cx="4" cy="5" r="2" />
        <circle cx="4" cy="19" r="2" />
        <circle cx="20" cy="19" r="2" />
    </svg>
);

export default DroneIcon;
