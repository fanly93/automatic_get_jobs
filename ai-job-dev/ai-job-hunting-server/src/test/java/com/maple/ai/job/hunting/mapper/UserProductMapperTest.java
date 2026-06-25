package com.maple.ai.job.hunting.mapper;

import com.maple.ai.job.hunting.emums.ProductTypeEnum;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 验证去付费闸门1：UserProductMapper.queryUserValidAllProductType 恒返回全部产品能力。
 * 用 Mockito CALLS_REAL_METHODS 直接调用接口 default 方法的真实逻辑（实现不触达 DB）。
 */
class UserProductMapperTest {

    @Test
    void queryUserValidAllProductType_恒返回全部产品能力_忽略userId与有效期() {
        UserProductMapper mapper = Mockito.mock(UserProductMapper.class, Answers.CALLS_REAL_METHODS);

        // 对任意用户（含不存在/未购买）都应返回全部能力
        Set<Integer> result = mapper.queryUserValidAllProductType(999L);

        Set<Integer> allCodes = Arrays.stream(ProductTypeEnum.values())
                .map(ProductTypeEnum::getCode)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        assertEquals(allCodes, result, "去付费后应恒返回全部产品能力");
        assertTrue(result.contains(ProductTypeEnum.AI_SEAT.getCode()), "应含 AI坐席");
        assertTrue(result.contains(ProductTypeEnum.CUSTOM_API.getCode()), "应含 自有API");
        assertTrue(result.contains(ProductTypeEnum.AI_FILTER.getCode()), "应含 AI过滤");
        assertFalse(result.isEmpty(), "不应为空");
    }
}
