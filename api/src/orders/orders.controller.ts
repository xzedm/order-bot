import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Query, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderService } from './order.service';

class CreateOrderDto {
	customerPhone: string;
	customerName?: string;
	customerEmail?: string;
	tgUserId?: string;
	items: Array<{ name: string; sku?: string; qty: number }>;
	source: string;
	originalMessage: string;
	locale?: string;
}

class ListOrdersQuery {
	status?: string;
	q?: string;
	dateFrom?: string;
	dateTo?: string;
	limit?: string;
	offset?: string;
}

class UpdateStatusDto {
	status: string;
	managerId?: string;
}

@ApiTags('Orders')
@Controller('api/orders')
export class OrdersController {
	constructor(private readonly orders: OrderService) {}

	@Post()
	@ApiOperation({ summary: 'Create order' })
	async create(@Body() dto: CreateOrderDto) {
		try {
			const order = await this.orders.createOrder(dto);
			return order;
		} catch (error: any) {
			throw new HttpException(
				{ message: 'Failed to create order', error: error?.message || String(error) },
				HttpStatus.BAD_REQUEST,
			);
		}
	}

	@Get()
	@ApiOperation({ summary: 'List orders' })
	async list(@Query() query: ListOrdersQuery) {
		const { status, q, dateFrom, dateTo } = query;
		const limit = Math.min(parseInt(query.limit || '50', 10), 200);
		const offset = parseInt(query.offset || '0', 10);
		return this.orders.listOrders({ status, q, dateFrom, dateTo, limit, offset });
	}

	@Get('customers')
	@ApiOperation({ summary: 'List customers with order stats' })
	async listCustomers() {
		return this.orders.listCustomers();
	}

	@Get('analytics')
	@ApiOperation({ summary: 'Get order analytics' })
	async getAnalytics() {
		return this.orders.getAnalytics();
	}

	@Get(':number')
	@ApiOperation({ summary: 'Get order by number' })
	async getByNumber(@Param('number') number: string) {
		const order = await this.orders.findOrderByNumber(number);
		if (!order) {
			throw new HttpException({ message: 'Order not found' }, HttpStatus.NOT_FOUND);
		}
		return order;
	}

	@Patch(':id/status')
	@ApiOperation({ summary: 'Update order status' })
	async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
		const updated = await this.orders.updateOrderStatus(id, dto.status, dto.managerId);
		if (!updated) {
			throw new HttpException({ message: 'Failed to update order' }, HttpStatus.BAD_REQUEST);
		}
		return updated;
	}
} 