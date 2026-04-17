package com.mahjong;

import com.mahjong.entity.UserEntity;
import com.mahjong.service.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.Optional;

/**
 * 四川双打竞技麻将比赛系统 - Spring Boot 主入口
 */
@SpringBootApplication
public class MahjongApplication implements CommandLineRunner {

    @Autowired
    private UserRepository userRepository;

    public static void main(String[] args) {
        SpringApplication.run(MahjongApplication.class, args);
    }

    @Override
    public void run(String... args) throws Exception {
        userRepository.findAll().forEach(user -> {
            if (user.getTotalScore() <= 0) {
                user.setTotalScore(500);
                userRepository.save(user);
            }
        });

        Optional<UserEntity> adminOpt = userRepository.findByUsername("admin");
        if (adminOpt.isEmpty()) {
            UserEntity admin = new UserEntity();
            admin.setUsername("admin");
            admin.setNickname("超级管理员");
            admin.setPassword(new BCryptPasswordEncoder().encode("000000"));
            admin.setRole(1);
            userRepository.save(admin);
            System.out.println("默认超级管理员已创建: admin / 000000");
        }
    }
}
