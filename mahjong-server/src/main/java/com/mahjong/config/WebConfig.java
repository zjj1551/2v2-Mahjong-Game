package com.mahjong.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 由于 Windows 和 Java 之间传递带中文字符的路径 (麻将) 容易导致 user.dir 乱码
        // 这里直接硬编码或使用最稳妥的绝对路径映射，并使用 Unicode 转义 \u9ebb\u5c06 防止源码编译时乱码
        String resourceLocation = "file:///C:/Users/23223/Desktop/\u9ebb\u5c06/mahjong-frontend/";
        System.out.println("Mapping static resources to: " + resourceLocation);
        
        // 映射所有的静态请求到 mahjong-frontend 文件夹
        registry.addResourceHandler("/**")
                .addResourceLocations(resourceLocation);
    }
}
