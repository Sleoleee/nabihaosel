/* eslint-disable react/display-name */
import * as React from "react";
import { drawTextCell, prepTextCell } from "../internal/data-grid/render/data-grid-lib.js";
import { GridCellKind } from "../internal/data-grid/data-grid-types.js";
const NumberOverlayEditor = React.lazy(async () => await import("../internal/data-grid-overlay-editor/private/number-overlay-editor.js"));
export const numberCellRenderer = {
    getAccessibilityString: c => c.data?.toString() ?? "",
    kind: GridCellKind.Number,
    needsHover: false,
    needsHoverPosition: false,
    useLabel: true,
    drawPrep: prepTextCell,
    draw: a => drawTextCell(a, a.cell.displayData, a.cell.contentAlign),
    measure: (ctx, cell, theme) => ctx.measureText(cell.displayData).width + theme.cellHorizontalPadding * 2,
    onDelete: c => ({
        ...c,
        data: undefined,
    }),
    provideEditor: () => p => {
        const { isHighlighted, onChange, value, validatedSelection } = p;
        return (React.createElement(React.Suspense, { fallback: null },
            React.createElement(NumberOverlayEditor, { highlight: isHighlighted, disabled: value.readonly === true, value: value.data, fixedDecimals: value.fixedDecimals, allowNegative: value.allowNegative, thousandSeparator: value.thousandSeparator, decimalSeparator: value.decimalSeparator, validatedSelection: validatedSelection, onChange: x => onChange({
                    ...value,
                    data: Number.isNaN(x.floatValue ?? 0) ? 0 : x.floatValue,
                }) })));
    },
    onPaste: (toPaste, cell, details) => {
        const newNumber = typeof details.rawValue === "number"
            ? details.rawValue
            : Number.parseFloat(typeof details.rawValue === "string" ? details.rawValue : toPaste);
        if (Number.isNaN(newNumber) || cell.data === newNumber)
            return undefined;
        return { ...cell, data: newNumber, displayData: details.formattedString ?? cell.displayData };
    },
};
//# sourceMappingURL=number-cell.js.map