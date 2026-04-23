import "@testing-library/jest-dom/vitest";

if (!document.queryCommandSupported) {
  document.queryCommandSupported = () => false;
}
