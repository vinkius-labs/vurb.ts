/**
 * Order Presenter — MVA View Layer with workflow actions
 */
import { definePresenter, ui } from '@vurb/core';
import { z } from 'zod';

export const OrderPresenter = definePresenter({
    name: 'Order',
    schema: z.object({
        id: z.string(),
        userId: z.string(),
        userName: z.string(),
        items: z.array(z.object({
            productId: z.string(),
            productName: z.string(),
            quantity: z.number(),
            unitPrice: z.number(),
        })),
        total: z.number().describe('Total in USD — display with $ prefix'),
        status: z.enum(['pending', 'confirmed', 'shipped', 'cancelled']),
        createdAt: z.string(),
    }),
    ui: (order) => [
        ui.markdown(
            `🛒 **Order ${order.id}** — ${order.userName}\n` +
            `Status: **${order.status.toUpperCase()}** | Total: $${order.total.toFixed(2)} | Items: ${order.items.length}`
        ),
    ],
    suggestActions: (order) => {
        switch (order.status) {
            case 'pending':
                return [
                    { tool: 'orders_confirm', reason: 'Confirm this pending order' },
                    { tool: 'orders_cancel', reason: 'Cancel this pending order' },
                ];
            case 'confirmed':
                return [{ tool: 'orders_ship', reason: 'Ship this confirmed order' }];
            default:
                return [];
        }
    },
});
