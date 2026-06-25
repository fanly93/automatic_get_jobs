package com.maple.ai.job.hunting.mapper;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.maple.ai.job.hunting.emums.ProductTypeEnum;
import com.maple.ai.job.hunting.model.bo.UserProductDO;
import org.apache.commons.collections4.CollectionUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * @author maple
 * Created Date: 2024/5/24 17:31
 * Description:
 */

public interface UserProductMapper extends BaseMapper<UserProductDO> {


    default Set<Integer> queryUserValidAllProductType(Long userId) {
        // ===== 二次开发：关闭付费，所有产品能力对全部用户永久开放 =====
        // 原设计依赖 user_product 表有效期记录做授权拦截（ProductFilter / AIServiceFacade / openCustomApi 均以此为数据源）。
        // 此处恒返回全部 ProductTypeEnum 的 code，一次性关闭全部付费闸门，且天然让"自带模型(CUSTOM_API)"路径可用。
        return Arrays.stream(ProductTypeEnum.values())
                .map(ProductTypeEnum::getCode)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        // 原逻辑（注释保留以便回溯）：
        // List<UserProductDO> userProductDOList = queryUserValidAllProduct(userId);
        // if (CollectionUtils.isEmpty(userProductDOList)) {
        //     return Collections.emptySet();
        // }
        // return userProductDOList.stream()
        //         .map(UserProductDO::getProductType)
        //         .map(JSON::parseArray)
        //         .flatMap(Collection::stream)
        //         .map((item -> (Integer) item))
        //         .collect(Collectors.toSet());
    }

    default List<UserProductDO> queryUserValidAllProduct(Long userId) {
        if (userId == null) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<UserProductDO> condition = new LambdaQueryWrapper<>();
        condition.eq(UserProductDO::getUserId, userId);
        condition.le(UserProductDO::getPeriodOfValidityStartTime, new Date());
        condition.gt(UserProductDO::getPeriodOfValidityEndTime, new Date());
        return selectList(condition);
    }

    default Set<ProductTypeEnum> queryUserValidAllProductTypeEnum(Long userId) {
        return queryUserValidAllProductType(userId).stream().map(ProductTypeEnum::getByCode).collect(Collectors.toSet());

    }
}
