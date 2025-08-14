import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

export class ChatMessageDto {
  message: string;
  sessionId: string;
  channel: 'web' | 'telegram';
}

@ApiTags('Chat')
@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  @ApiOperation({ summary: 'Process web chat message' })
  async handleMessage(@Body() dto: ChatMessageDto) {
    try {
      const result = await this.chatService.processMessage(dto);
      return {
        reply: result.reply,
        orderId: result.orderId,
        products: result.products,
        status: 'success'
      };
    } catch (error) {
      console.error('[ChatController] Error:', error);
      throw new HttpException(
        { message: 'Failed to process message', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}