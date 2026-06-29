package com.maple.ai.job.hunting.service.ai;

import com.maple.ai.job.hunting.common.HeaderContext;
import com.maple.ai.job.hunting.config.AppBizConfig;
import com.maple.ai.job.hunting.mapper.UserAIConfigMapper;
import com.maple.ai.job.hunting.model.AiFileResolveResult;
import com.maple.ai.job.hunting.model.bo.UserAIConfigDO;
import com.maple.ai.job.hunting.model.vo.UserInfoVO;
import com.maple.ai.job.hunting.service.ai.impl.CustomOpenAIService;
import com.maple.ai.job.hunting.service.ai.impl.OpenAIService;
import com.maple.smart.config.core.annotation.JsonValue;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.ChatResponse;
import org.springframework.ai.chat.Generation;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatClient;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.util.MimeTypeUtils;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OcrRoutingTest {

    private static final byte[] PNG_BYTES = new byte[]{
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00
    };

    @AfterEach
    void tearDown() {
        HeaderContext.clear();
    }

    @Test
    void defaultFileScene_doesNotRouteToKimi() throws Exception {
        Field field = AppBizConfig.class.getDeclaredField("sceneUseAiMap");
        JsonValue jsonValue = field.getAnnotation(JsonValue.class);

        String defaultExpression = jsonValue.value();
        assertNotEquals(-1, defaultExpression.indexOf("\"file\":\"openai-pool\""));
        assertEquals(-1, defaultExpression.indexOf("\"file\":\"kimi\""));
    }

    @Test
    void readFile_usesCustomOpenAIService_whenUserConfigEnabled() {
        UserInfoVO userInfo = new UserInfoVO();
        userInfo.setId(7L);
        HeaderContext.initHeader(userInfo, false, "127.0.0.1", "/api/user/import/resume");

        UserAIConfigMapper userAIConfigMapper = mock(UserAIConfigMapper.class);
        when(userAIConfigMapper.getEnabledConfig(7L)).thenReturn(new UserAIConfigDO());

        CustomOpenAIService customOpenAIService = mock(CustomOpenAIService.class);
        AiFileResolveResult customResult = AiFileResolveResult.builder()
                .originalFileContent("custom vision result")
                .build();
        when(customOpenAIService.readFile(any(InputStream.class), any())).thenReturn(customResult);

        AIService poolService = mock(AIService.class);
        AppBizConfig appBizConfig = mock(AppBizConfig.class);
        when(appBizConfig.getSceneUseAiMap()).thenReturn(Map.of("file", "openai-pool"));

        AIServiceFacade facade = new AIServiceFacade();
        ReflectionTestUtils.setField(facade, "appBizConfig", appBizConfig);
        ReflectionTestUtils.setField(facade, "aiServiceMap", Map.of("openai-pool", poolService));
        ReflectionTestUtils.setField(facade, "customOpenAIService", customOpenAIService);
        ReflectionTestUtils.setField(facade, "userAIConfigMapper", userAIConfigMapper);

        AiFileResolveResult result = facade.readFile(new ByteArrayInputStream(PNG_BYTES), "extract resume");

        assertEquals(customResult, result);
        verify(customOpenAIService).readFile(any(InputStream.class), any());
        verify(poolService, never()).readFile(any(InputStream.class), any());
    }

    @Test
    void openAIReadFile_sendsImageMediaPrompt() {
        OpenAiChatClient chatClient = mock(OpenAiChatClient.class);
        when(chatClient.call(any(Prompt.class))).thenReturn(new ChatResponse(List.of(new Generation("resume text"))));

        TestOpenAIService service = new TestOpenAIService(chatClient);
        AiFileResolveResult result = service.readFile(new ByteArrayInputStream(PNG_BYTES), "extract resume");

        assertEquals("resume text", result.getOriginalFileContent());

        ArgumentCaptor<Prompt> promptCaptor = ArgumentCaptor.forClass(Prompt.class);
        verify(chatClient).call(promptCaptor.capture());

        List<Message> instructions = promptCaptor.getValue().getInstructions();
        assertEquals(1, instructions.size());
        UserMessage userMessage = assertInstanceOf(UserMessage.class, instructions.get(0));
        assertEquals("extract resume", userMessage.getContent());
        assertFalse(userMessage.getMedia().isEmpty());
        assertEquals(MimeTypeUtils.IMAGE_PNG, userMessage.getMedia().get(0).getMimeType());
        assertEquals(PNG_BYTES.length, ((byte[]) userMessage.getMedia().get(0).getData()).length);
    }

    static class TestOpenAIService extends OpenAIService {
        private final OpenAiChatClient chatClient;

        TestOpenAIService(OpenAiChatClient chatClient) {
            this.chatClient = chatClient;
        }

        @Override
        protected OpenAiChatClient getClient() {
            return chatClient;
        }
    }
}
