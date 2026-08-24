### 1.4.4 路径相关消息接口

在ROS2中路径消息被封装为了`nav_msgs/msg/Path`接口。可通过指令`ros2 interface show nav_msgs/msg/Path`查看该接口的具体数据结构，结果如下：

```
# 它包含一组描述机器人姿态的数据

# 消息标头
std_msgs/Header header
    builtin_interfaces/Time stamp
        int32 sec
        uint32 nanosec
    string frame_id

# 姿态数组
geometry_msgs/PoseStamped[] poses
    std_msgs/Header header
        builtin_interfaces/Time stamp
            int32 sec
            uint32 nanosec
        string frame_id
    Pose pose
        Point position # 坐标
            float64 x
            float64 y
            float64 z
        Quaternion orientation # 四元数
            float64 x 0
            float64 y 0
            float64 z 0
            float64 w 1
```

对比之前的里程计消息，会发现二者都包含姿态数据，只不过，里程计当中所描述的是某一时刻机器人的姿态，而在路径接口中，是多个姿态的集合。另外还需要注意的是，里程计中的姿态使用接口是`geometry_msgs/PoseWithCovariance`，而路径中的姿态使用的接口是`geometry_msgs/PoseStamped`，二者并不完全相同。

