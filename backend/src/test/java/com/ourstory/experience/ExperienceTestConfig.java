package com.ourstory.experience;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.datasource.DelegatingDataSource;

/** A settable clock plus a JDBC statement counter (to prove there is no N+1). */
@TestConfiguration
class ExperienceTestConfig {

    /** Statements prepared or created through the application DataSource since the last reset. */
    static final AtomicInteger STATEMENTS = new AtomicInteger();

    /** Clock tests move to any instant; never sleeps. */
    static final class SettableClock extends Clock {
        private volatile Instant now = Instant.parse("2026-10-01T00:00:00Z");

        void set(Instant instant) {
            now = instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    @Bean
    SettableClock clock() {
        return new SettableClock();
    }

    @Bean
    static BeanPostProcessor statementCountingDataSource() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if (!(bean instanceof DataSource dataSource) || bean instanceof CountingDataSource) {
                    return bean;
                }
                return new CountingDataSource(dataSource);
            }
        };
    }

    private static final class CountingDataSource extends DelegatingDataSource {
        CountingDataSource(DataSource target) {
            super(target);
        }

        @Override
        public Connection getConnection() throws java.sql.SQLException {
            return counting(super.getConnection());
        }

        @Override
        public Connection getConnection(String username, String password) throws java.sql.SQLException {
            return counting(super.getConnection(username, password));
        }

        private static Connection counting(Connection connection) {
            return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(),
                    new Class<?>[] {Connection.class}, (proxy, method, args) -> {
                        if (method.getName().startsWith("prepare") || method.getName().equals("createStatement")) {
                            STATEMENTS.incrementAndGet();
                        }
                        try {
                            return method.invoke(connection, args);
                        } catch (InvocationTargetException e) {
                            throw e.getCause();
                        }
                    });
        }
    }
}
