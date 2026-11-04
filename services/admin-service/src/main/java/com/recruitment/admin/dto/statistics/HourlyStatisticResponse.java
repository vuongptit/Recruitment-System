package com.recruitment.admin.dto.statistics;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;

public record HourlyStatisticResponse(@JsonProperty("stat_date") Instant bucketStart, String metric, long value) {}
