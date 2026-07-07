package com.maple.ai.job.hunting.service.biz;

import com.maple.ai.job.hunting.mapper.UserInfoMapper;
import com.maple.ai.job.hunting.mapper.UserResumeMapper;
import com.maple.ai.job.hunting.model.bo.UserInfoDO;
import com.maple.ai.job.hunting.model.bo.UserResumeDO;
import com.maple.ai.job.hunting.model.vo.UserInfoVO;
import com.maple.ai.job.hunting.service.ai.AIServiceFacade;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserServiceImportResumeFallbackTest {

    @Test
    void importResume_savesLocalExtractedTextWhenAiFileReadFails() throws Exception {
        AIServiceFacade aiServiceFacade = mock(AIServiceFacade.class);
        when(aiServiceFacade.readFile(any(), any())).thenThrow(new RuntimeException("Invalid Authentication"));

        UserInfoMapper userInfoMapper = mock(UserInfoMapper.class);
        when(userInfoMapper.selectByUniqueId("boss-123")).thenReturn(null);

        UserResumeMapper userResumeMapper = mock(UserResumeMapper.class);

        UserService userService = new UserService();
        ReflectionTestUtils.setField(userService, "aiServiceFacade", aiServiceFacade);
        ReflectionTestUtils.setField(userService, "userInfoMapper", userInfoMapper);
        ReflectionTestUtils.setField(userService, "userResumeMapper", userResumeMapper);

        byte[] resumeBytes = "Java Backend Engineer\nemail: coder@example.com\nphone: 13800138000".getBytes(StandardCharsets.UTF_8);

        UserInfoVO result = userService.importResume(new ByteArrayInputStream(resumeBytes), "boss-123", "resume-1");

        assertEquals("coder@example.com", result.getEmail());
        assertEquals("13800138000", result.getPhone());

        ArgumentCaptor<UserResumeDO> resumeCaptor = ArgumentCaptor.forClass(UserResumeDO.class);
        verify(userResumeMapper).insert(resumeCaptor.capture());
        assertTrue(resumeCaptor.getValue().getResumeContent().contains("Java Backend Engineer"));
    }

    @Test
    void userService_doesNotWriteFullResumeToLogs() throws Exception {
        String source = Files.readString(Path.of("src/main/java/com/maple/ai/job/hunting/service/biz/UserService.java"));

        assertTrue(source.contains("resumeLength:{}"));
        assertTrue(!source.contains("resume:{}"));
    }
}
