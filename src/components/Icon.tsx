import { iconSvg, type IconName } from '../lib/icons.ts';

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <span className="icon" dangerouslySetInnerHTML={{ __html: iconSvg(name, size) }} />;
}
