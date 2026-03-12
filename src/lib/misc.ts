export function getStaticProps(cls: any) {
  return Object.getOwnPropertyNames(cls)
    .filter(p => !["length", "name", "prototype"].includes(p))
    .map(p => [p, cls[p]]);
}