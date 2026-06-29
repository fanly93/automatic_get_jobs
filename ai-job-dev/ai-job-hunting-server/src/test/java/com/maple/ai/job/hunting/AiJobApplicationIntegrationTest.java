package com.maple.ai.job.hunting;

import com.maple.ai.job.hunting.controller.JobSeekerClonedController;
import com.maple.ai.job.hunting.controller.UserAIConfigController;
import com.maple.ai.job.hunting.frame.GlobalExceptionHandler;
import com.maple.ai.job.hunting.frame.filter.LoginFilter;
import com.maple.ai.job.hunting.frame.filter.ProductFilter;
import com.maple.ai.job.hunting.model.bo.UserAIConfigDO;
import com.maple.ai.job.hunting.model.vo.JobSeekerClonedResultVO;
import com.maple.ai.job.hunting.service.biz.JobSeekerClonedService;
import com.maple.ai.job.hunting.service.biz.MsgSessionService;
import com.maple.ai.job.hunting.service.biz.UserAIConfigService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Collections;
import java.util.List;

import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AiJobApplicationIntegrationTest {

    private MockMvc jobSeekerMockMvc;
    private MockMvc userAiConfigMockMvc;

    @Mock
    private JobSeekerClonedService jobSeekerClonedService;

    @Mock
    private MsgSessionService msgSessionService;

    @Mock
    private UserAIConfigService userAIConfigService;

    @BeforeEach
    void setUp() {
        ProductFilter productFilter = new ProductFilter();
        LoginFilter loginFilter = new LoginFilter();
        ReflectionTestUtils.setField(loginFilter, "freeLoginList", List.of(
                "/api/job/seeker/cloned/ask",
                "/api/user/ai/config/save"
        ));

        JobSeekerClonedController jobSeekerClonedController = new JobSeekerClonedController();
        ReflectionTestUtils.setField(jobSeekerClonedController, "jobSeekerClonedService", jobSeekerClonedService);
        ReflectionTestUtils.setField(jobSeekerClonedController, "msgSessionService", msgSessionService);

        UserAIConfigController userAIConfigController = new UserAIConfigController();
        ReflectionTestUtils.setField(userAIConfigController, "userAIConfigService", userAIConfigService);

        jobSeekerMockMvc = MockMvcBuilders.standaloneSetup(jobSeekerClonedController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .addFilters(loginFilter, productFilter)
                .build();
        userAiConfigMockMvc = MockMvcBuilders.standaloneSetup(userAIConfigController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .addFilters(loginFilter, productFilter)
                .build();
    }

    @Test
    void askEndpoint_doesNotReturnProductNotAuthorized_5001() throws Exception {
        when(jobSeekerClonedService.ask(any())).thenReturn(new JobSeekerClonedResultVO(
                Collections.emptyList(),
                "ok",
                Collections.emptyList()
        ));

        jobSeekerMockMvc.perform(post("/api/job/seeker/cloned/ask")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "question": "请介绍一下岗位",
                                  "jobKey": "job-1:boss-1",
                                  "jobInfo": {}
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(content().string(not(containsString("\"code\":5001"))));
    }

    @Test
    void saveAiConfig_doesNotRequireCustomApiProduct() throws Exception {
        when(userAIConfigService.save(any(UserAIConfigDO.class))).thenReturn(true);

        userAiConfigMockMvc.perform(post("/api/user/ai/config/save")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "provider": 0,
                                  "modelName": "local-model",
                                  "apiKey": "test-key",
                                  "baseUrl": "http://127.0.0.1:11434/v1",
                                  "timeout": 60,
                                  "completionsPath": "/chat/completions",
                                  "testPassed": 1,
                                  "status": 1
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(content().string(not(containsString("\"code\":5001"))));
    }
}
