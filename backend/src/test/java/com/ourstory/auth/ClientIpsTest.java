package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ClientIpsTest {

    @Test
    void ipv4IsExactAndIpv6IsTheSlash64() {
        assertThat(ClientIps.limiterKey("203.0.113.9")).isEqualTo("203.0.113.9");
        assertThat(ClientIps.limiterKey("2001:db8:aa:bb:1:2:3:4"))
                .isEqualTo(ClientIps.limiterKey("2001:db8:aa:bb::ffff"));
        assertThat(ClientIps.limiterKey("2001:db8:aa:bb::1"))
                .isNotEqualTo(ClientIps.limiterKey("2001:db8:aa:bc::1"));
        assertThat(ClientIps.limiterKey("fe80::1%eth0")).isEqualTo(ClientIps.limiterKey("fe80::2"));
        assertThat(ClientIps.limiterKey("::ffff:10.1.2.3")).isEqualTo("10.1.2.3");
    }

    @Test
    void unparseableValuesAreKeptRawAndNeverResolved() {
        assertThat(ClientIps.limiterKey("not-an-ip.example")).isEqualTo("not-an-ip.example");
        assertThat(ClientIps.limiterKey(null)).isEqualTo("unknown");
        assertThat(ClientIps.limiterKey("x".repeat(200))).hasSize(64);
        assertThat(ClientIps.limiterKey("zz:zz:zz")).isEqualTo("zz:zz:zz");
        assertThat(ClientIps.limiterKey(" ")).isEqualTo(" ");
    }

    @Test
    void maskingHidesTheHostPart() {
        assertThat(ClientIps.mask("203.0.113.9")).isEqualTo("203.0.*.*");
        assertThat(ClientIps.mask("2001:db8:aa:bb:1:2:3:4")).isEqualTo("2001:db8:aa::*");
        assertThat(ClientIps.mask("::1")).isEqualTo("0:0:0::*");
        assertThat(ClientIps.mask("garbage")).isEqualTo("unknown");
        assertThat(ClientIps.mask(null)).isEqualTo("unknown");
        assertThat(ClientIps.mask("")).isEqualTo("unknown");
    }
}
