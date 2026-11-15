// Questions and decisions for the confirmation dialog (AC26a); kept free of React and the DOM so they can be tested.

export interface ConfirmRequest {
  question: string;
  confirmLabel: string;
}

export const deleteProjectConfirm = (projectName: string): ConfirmRequest => ({
  question: `Delete project "${projectName}"? This cannot be undone.`,
  confirmLabel: "Delete project",
});

export const removeFontConfirm = (fontName: string): ConfirmRequest => ({
  question: `Remove "${fontName}" from the font library? Projects that use it will need another font.`,
  confirmLabel: "Remove font",
});

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// A click on the dialog element outside its box is a click on the backdrop.
export function isBackdropClick(box: Box, x: number, y: number): boolean {
  return x < box.left || x > box.right || y < box.top || y > box.bottom;
}

// Only the destructive button confirms; Escape, the backdrop and Cancel all cancel.
export type DialogEvent = "confirm" | "cancel" | "escape" | "backdrop";
export const confirmsAction = (event: DialogEvent): boolean => event === "confirm";
