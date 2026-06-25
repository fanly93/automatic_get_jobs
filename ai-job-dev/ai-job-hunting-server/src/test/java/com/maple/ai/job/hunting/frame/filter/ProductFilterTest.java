package com.maple.ai.job.hunting.frame.filter;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * 验证去付费闸门2：ProductFilter.doFilter 直接放行所有请求，不再走产品权限/试用校验。
 * 改造后 ProductFilter 在方法首行即 filterChain.doFilter(...) + return，不触碰任何 @Resource 依赖，
 * 因此可在无 Spring 容器（new 出来、依赖为 null）的情况下验证放行行为。
 */
class ProductFilterTest {

    @Test
    void doFilter_直接放行_不拦截任何请求且不抛异常() throws Exception {
        ProductFilter filter = new ProductFilter();
        // 选一个原本需要 AI_SEAT/CUSTOM_API 权限的 URL，证明双保险后也放行
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/job/seeker/cloned/ask");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        // 放行后 filterChain 已被调用：MockFilterChain 会记录传入的 request
        assertNotNull(chain.getRequest(), "ProductFilter 应直接放行，调用 filterChain");
    }
}
