interface LogoProps {
  compact?: boolean;
}

export function Logo({ compact = false }: LogoProps) {
  return (
    <div className="brand" aria-label="Card237">
      <span className="brand-mark" aria-hidden="true">
        ♠
      </span>
      {!compact && (
        <span className="brand-text">
          CARD<span className="text-gold-300">237</span>
        </span>
      )}
    </div>
  );
}
