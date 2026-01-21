export type DrawingType = 'trendline' | 'ray' | 'horizontal_line' | 'vertical_line' | 'rectangle' | 'fibonacci';

export interface Point {
    timestamp: number;
    price: number;
}

export interface Drawing {
    id: string;
    type: DrawingType;
    points: Point[]; // Trendline: 2 points, H-Line: 1 point, Fib: 2 points
    properties: {
        color: string;
        lineWidth: number;
        lineStyle?: 'solid' | 'dashed' | 'dotted';
        fibLevels?: number[]; // [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
        filled?: boolean; // For rectangles etc
    };
}

export const DEFAULT_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
