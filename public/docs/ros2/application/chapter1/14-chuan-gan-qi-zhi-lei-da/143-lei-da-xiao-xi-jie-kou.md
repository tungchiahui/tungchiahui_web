### 1.5.2 单线激光雷达消息接口

在ROS2中单线雷达消息被封装为了`sensor_msgs/msg/LaserScan`接口，可通过指令`ros2 interface show sensor_msgs/msg/LaserScan`查看该接口的具体数据结构，结果如下：

```
# 该接口用于描述单线激光雷达单次扫描的数据

std_msgs/Header header # 标头
        builtin_interfaces/Time stamp # 本次扫描的开始时间
                int32 sec
                uint32 nanosec
        string frame_id         # 雷达坐标系，测量规则是：围绕正Z轴（Z向上）逆时针测量角度，零角度沿x轴指向正前


float32 angle_min            # 扫描起始角度[以弧度为单位]
float32 angle_max            # 扫描结束角度[以弧度为单位]
float32 angle_increment      # 相邻两条射线之间的角距离[以弧度为单位]

float32 time_increment       # 发射激光光束的间隔增量[以秒为单位]
float32 scan_time            # 完成一个扫描周期所需的时间[以秒为单位]

float32 range_min            # 最小测量距离[以米为单位]
float32 range_max            # 最大测量距离[以米为单位]

float32[] ranges             # 距离数据[以米为单位]，应丢弃小于range_min或大于range_max的数据
float32[] intensities        # 强度数据[设备特定单位]，如果设备不提供强度，请将数组置空
```



