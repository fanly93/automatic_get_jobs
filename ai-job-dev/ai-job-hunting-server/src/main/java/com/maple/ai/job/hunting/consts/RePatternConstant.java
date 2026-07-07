package com.maple.ai.job.hunting.consts;

import java.util.regex.Pattern;

/**
 * @author maple
 * Created Date: 2024/5/13 16:14
 * Description:
 */

public class RePatternConstant {

    // 编译正则表达式
    public static final Pattern PHONE_PATTERN = Pattern.compile("(?i)(?:电话|phone|tel|联系方式|联系电话)?\\s*[:：]?\\s*(1[3-9]\\d{9})");

    public static final Pattern EMAIL_PATTERN = Pattern.compile("(?i)(?:邮箱|email|mail)?\\s*[:：]?\\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})");
}
