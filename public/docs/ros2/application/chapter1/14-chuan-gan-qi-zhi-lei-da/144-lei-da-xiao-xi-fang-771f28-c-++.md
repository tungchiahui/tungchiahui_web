### 1.5.4 单线激光雷达仿真\(C++\)

#### 1.发布方实现

功能包cpp01\_laser的src目录下，新建C++文件sim\_laser.cpp，并编辑文件，输入如下内容：

```cpp
/*
    需求：雷达仿真，发布雷达消息。
    流程：
        1.包含头文件；
        2.初始化ROS2客户端；
        3.自定义节点类；
          3-1.创建发布方；
          3-2.创建定时器；
          3-3.组织消息并发布。
        4.调用spin函数，并传入节点对象指针；
        5.资源释放。
*/
// 1.包含头文件；
#include "rclcpp/rclcpp.hpp"
#include "sensor_msgs/msg/laser_scan.hpp"

using namespace std::chrono_literals;

// 3.定义节点类；
class LaserPublisher : public rclcpp::Node
{
  public:
    LaserPublisher()
    : Node("laser_publisher"),radius(3.0)
    {
      // 3-1.创建发布方；
      publisher_ = this->create_publisher<sensor_msgs::msg::LaserScan>("scan", 10);
      // 3-2.创建定时器；
      timer_ = this->create_wall_timer(200ms, std::bind(&LaserPublisher::timer_callback, this));
    }

  private:
    void timer_callback()
    {
      // 3-3.组织消息并发布。
      auto message = sensor_msgs::msg::LaserScan();

      // 雷达参数设置
      unsigned int num_readings = 100; //转一圈采集个点
      double laser_frequency = 5.0;

      // 组织消息
      message.header.stamp = this->get_clock()->now();
      message.header.frame_id = "laser";
      message.angle_min = -3.141;
      message.angle_max = 3.141;
      message.angle_increment = 6.28 / num_readings;
      message.time_increment = 1 / laser_frequency / num_readings;
      message.range_min = 0.15;
      message.range_max = 12;

      message.ranges.resize(num_readings);
      message.intensities.resize(num_readings);
      for (size_t i = 0; i < num_readings; i++)
      {
        message.ranges[i] = radius;
        message.intensities[i] = 100;
      }
      if (radius >= message.range_min + 0.2)
      {
        radius -= 0.05;
      }

      publisher_->publish(message);
    }
    rclcpp::TimerBase::SharedPtr timer_;
    rclcpp::Publisher<sensor_msgs::msg::LaserScan>::SharedPtr publisher_;
    float_t radius;
};

int main(int argc, char * argv[])
{
  // 2.初始化 ROS2 客户端；
  rclcpp::init(argc, argv);
  // 4.调用spin函数，并传入节点对象指针。
  rclcpp::spin(std::make_shared<LaserPublisher>());
  // 5.释放资源；
  rclcpp::shutdown();
  return 0;
}
```

#### 2.编辑配置文件

##### 1.packages.xml {#1packagesxml}

在创建功能包时，所依赖的功能包已经自动配置了，配置内容如下：

```xml
<depend>rclcpp</depend>
<depend>sensor_msgs</depend>
```

##### 2.CMakeLists.txt {#2cmakeliststxt}

CMakeLists.txt 中核心配置如下：

```
# find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(sensor_msgs REQUIRED)

add_executable(sim_laser src/sim_laser.cpp)

ament_target_dependencies(
  sim_laser
  "rclcpp"
  "sensor_msgs"
)

install(TARGETS sim_laser
  DESTINATION lib/${PROJECT_NAME})
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select cpp01_laser
```

#### 4.执行

当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run cpp01_laser sim_laser
```

#### 5.使用rviz2查看结果

新建终端，输入如下指令：

```
rviz2
```

rviz2启动后，将参考坐标系设置为laser，添加雷达消息插件并将话题设置为laser，最终运行结果与演示案例类似。

