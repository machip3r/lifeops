/** Each import batch (Server Action) stays well under this; the whole file has no total limit. */
export const maxDuration = 60;

export default function ExtractorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
